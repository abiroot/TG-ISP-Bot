import { conversationRagService } from './conversationRagService'
import { pool } from '~/config/database'
import { createFlowLogger } from '~/utils/logger'
import { env } from '~/config/env'

const workerLogger = createFlowLogger('embedding-worker')

/**
 * Configuration for the embedding worker
 */
export interface WorkerConfig {
    batchSize: number // Process this many contexts per run
    intervalMs: number // How often to run (in milliseconds)
    messagesThreshold: number // Trigger embedding after N new messages
    enabled: boolean // Master enable/disable
}

/**
 * Statistics about worker execution
 */
export interface WorkerStats {
    totalRuns: number
    successfulRuns: number
    failedRuns: number
    contextsProcessed: number
    messagesEmbedded: number
    lastRunAt: Date | null
    lastError: string | null
    isRunning: boolean
}

/**
 * Embedding Worker Service
 * Runs in the background to periodically embed new conversation messages
 */
export class EmbeddingWorkerService {
    private config: WorkerConfig
    private stats: WorkerStats
    private intervalHandle: NodeJS.Timeout | null = null
    private processingQueue: Set<string> = new Set() // Track contexts being processed

    constructor(config?: Partial<WorkerConfig>) {
        this.config = {
            batchSize: env.RAG_EMBEDDING_BATCH_SIZE ?? 5,
            intervalMs: env.RAG_WORKER_INTERVAL_MS ?? 300000, // Default: 5 minutes
            messagesThreshold: env.RAG_MESSAGES_THRESHOLD ?? 10,
            enabled: env.RAG_WORKER_ENABLED ?? true,
            ...config,
        }

        this.stats = {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            contextsProcessed: 0,
            messagesEmbedded: 0,
            lastRunAt: null,
            lastError: null,
            isRunning: false,
        }

        workerLogger.info({ config: this.config }, 'Embedding worker service initialized')
    }

    /**
     * Start the background worker
     */
    start(): void {
        if (!this.config.enabled) {
            workerLogger.warn('Embedding worker is disabled in configuration')
            return
        }

        if (this.intervalHandle) {
            workerLogger.warn('Embedding worker already running')
            return
        }

        workerLogger.info({ intervalMs: this.config.intervalMs }, 'Starting embedding worker')

        // Run immediately on start
        this.runWorkerCycle().catch((error) => {
            workerLogger.error({ err: error }, 'Error in initial worker run')
        })

        // Schedule periodic runs
        this.intervalHandle = setInterval(() => {
            this.runWorkerCycle().catch((error) => {
                workerLogger.error({ err: error }, 'Error in scheduled worker run')
            })
        }, this.config.intervalMs)

        workerLogger.info('Embedding worker started successfully')
    }

    /**
     * Stop the background worker
     */
    stop(): void {
        if (!this.intervalHandle) {
            workerLogger.warn('Embedding worker not running')
            return
        }

        clearInterval(this.intervalHandle)
        this.intervalHandle = null
        workerLogger.info('Embedding worker stopped')
    }

    /**
     * Run one cycle of the worker
     * Processes contexts that need embedding
     */
    private async runWorkerCycle(): Promise<void> {
        if (this.stats.isRunning) {
            workerLogger.warn('Worker cycle already in progress, skipping')
            return
        }

        this.stats.isRunning = true
        this.stats.totalRuns++
        this.stats.lastRunAt = new Date()

        const cycleStartTime = Date.now()
        workerLogger.info({ run: this.stats.totalRuns }, 'Starting worker cycle')

        try {
            // Get contexts that need processing
            const contextsToProcess = await this.findContextsNeedingEmbedding()

            if (contextsToProcess.length === 0) {
                workerLogger.debug('No contexts need embedding')
                this.stats.successfulRuns++
                return
            }

            workerLogger.info({ contexts: contextsToProcess.length }, 'Found contexts needing embedding')

            // Process each context
            let processedCount = 0
            let embeddedCount = 0

            for (const contextId of contextsToProcess) {
                // Skip if already being processed
                if (this.processingQueue.has(contextId)) {
                    workerLogger.debug({ contextId }, 'Context already in processing queue, skipping')
                    continue
                }

                try {
                    this.processingQueue.add(contextId)

                    const startTime = Date.now()
                    const messagesProcessed = await conversationRagService.processUnembeddedMessages(contextId)
                    const duration = Date.now() - startTime

                    if (messagesProcessed > 0) {
                        workerLogger.info(
                            { contextId, messagesProcessed, durationMs: duration },
                            'Successfully embedded messages'
                        )
                        embeddedCount += messagesProcessed
                    }

                    processedCount++
                } catch (error) {
                    workerLogger.error({ err: error, contextId }, 'Failed to process context')
                } finally {
                    this.processingQueue.delete(contextId)
                }

                // Stop if we've hit the batch size limit
                if (processedCount >= this.config.batchSize) {
                    workerLogger.info({ processed: processedCount }, 'Batch size limit reached')
                    break
                }
            }

            this.stats.contextsProcessed += processedCount
            this.stats.messagesEmbedded += embeddedCount
            this.stats.successfulRuns++

            const cycleDuration = Date.now() - cycleStartTime
            workerLogger.info(
                {
                    run: this.stats.totalRuns,
                    contextsProcessed: processedCount,
                    messagesEmbedded: embeddedCount,
                    durationMs: cycleDuration,
                },
                'Worker cycle completed successfully'
            )
        } catch (error) {
            this.stats.failedRuns++
            this.stats.lastError = error instanceof Error ? error.message : String(error)
            workerLogger.error({ err: error, run: this.stats.totalRuns }, 'Worker cycle failed')
        } finally {
            this.stats.isRunning = false
        }
    }

    /**
     * Find contexts that need embedding
     * Returns context IDs with new messages exceeding the threshold
     */
    private async findContextsNeedingEmbedding(): Promise<string[]> {
        try {
            // Get all unique context IDs from recent messages
            // This is a simplified approach - in production you might want a more sophisticated queue
            const query = `
                SELECT context_id, COUNT(*) as message_count, MAX(created_at) as latest_message
                FROM messages
                WHERE created_at > NOW() - INTERVAL '1 day'
                AND content IS NOT NULL
                AND is_deleted = FALSE
                GROUP BY context_id
                HAVING COUNT(*) >= $1
                ORDER BY MAX(created_at) DESC
                LIMIT $2
            `

            const result = await pool.query(query, [
                this.config.messagesThreshold,
                this.config.batchSize * 2, // Get more candidates than batch size
            ])

            return result.rows.map((row) => row.context_id)
        } catch (error) {
            workerLogger.error({ err: error }, 'Failed to find contexts needing embedding')
            return []
        }
    }

    /**
     * Manually trigger embedding for a specific context
     * Useful for admin commands or immediate processing
     */
    async processContextNow(contextId: string): Promise<number> {
        if (this.processingQueue.has(contextId)) {
            workerLogger.warn({ contextId }, 'Context already being processed')
            throw new Error('Context is already being processed')
        }

        try {
            this.processingQueue.add(contextId)
            workerLogger.info({ contextId }, 'Manually triggering embedding for context')

            const messagesProcessed = await conversationRagService.processUnembeddedMessages(contextId)

            workerLogger.info({ contextId, messagesProcessed }, 'Manual embedding completed')
            return messagesProcessed
        } finally {
            this.processingQueue.delete(contextId)
        }
    }

    /**
     * Get worker statistics
     */
    getStats(): WorkerStats {
        return { ...this.stats }
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.stats = {
            totalRuns: 0,
            successfulRuns: 0,
            failedRuns: 0,
            contextsProcessed: 0,
            messagesEmbedded: 0,
            lastRunAt: null,
            lastError: null,
            isRunning: this.stats.isRunning, // Keep current running state
        }
        workerLogger.info('Worker statistics reset')
    }

    /**
     * Get current configuration
     */
    getConfig(): WorkerConfig {
        return { ...this.config }
    }

    /**
     * Update worker configuration
     * Note: Interval changes require restart to take effect
     */
    updateConfig(newConfig: Partial<WorkerConfig>): void {
        const wasEnabled = this.config.enabled
        this.config = { ...this.config, ...newConfig }

        workerLogger.info({ config: this.config }, 'Worker configuration updated')

        // Handle enable/disable
        if (!wasEnabled && this.config.enabled) {
            this.start()
        } else if (wasEnabled && !this.config.enabled) {
            this.stop()
        }
    }

    /**
     * Check if worker is running
     */
    isRunning(): boolean {
        return this.intervalHandle !== null
    }

    /**
     * Get contexts currently being processed
     */
    getProcessingQueue(): string[] {
        return Array.from(this.processingQueue)
    }
}

// Export singleton instance
export const embeddingWorkerService = new EmbeddingWorkerService()
