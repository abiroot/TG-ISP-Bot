/**
 * Task Creation Store
 *
 * Temporary in-memory store for task creation wizard state.
 * Replaces PostgreSQL persistent state to avoid race conditions
 * when users click through the wizard quickly.
 *
 * Why this exists:
 * - BuilderBot's PostgreSQL state adapter has async write delays
 * - Multiple rapid state.update() calls cause race conditions
 * - Task data is lost between flows
 * - This store provides instant, reliable state management
 */

import type { TaskType } from '~/features/billing/index.js'
import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('task-creation-store')

/**
 * Task creation wizard state data
 */
export interface TaskCreationData {
    // Customer info (from customerTaskFlow)
    customerUsername?: string
    customerName?: string
    customerPhone?: string

    // Task details (from taskTypeSelectionFlow)
    taskType?: TaskType
    taskMessage?: string

    // Worker selection (from taskWorkerSelectionFlow)
    selectedWorkerId?: number
    selectedWorkerName?: string
    workerIds?: number[]

    // WhatsApp notification (from taskWhatsAppToggleFlow)
    sendWhatsApp?: 0 | 1

    // Metadata
    createdAt?: Date
    lastUpdated?: Date
}

/**
 * In-memory store for task creation wizard
 * Keyed by user ID (ctx.from)
 */
export class TaskCreationStore {
    private store: Map<string, TaskCreationData>

    constructor() {
        this.store = new Map()
        logger.info('TaskCreationStore initialized')
    }

    /**
     * Set task creation data for a user
     * Merges with existing data (like state.update())
     */
    set(userId: string, data: Partial<TaskCreationData>): void {
        const existing = this.store.get(userId) || {}
        const merged = {
            ...existing,
            ...data,
            lastUpdated: new Date(),
        }

        // Set createdAt only on first write
        if (!existing.createdAt) {
            merged.createdAt = new Date()
        }

        this.store.set(userId, merged)

        logger.debug(
            {
                userId,
                keys: Object.keys(data),
                totalKeys: Object.keys(merged).length,
            },
            'Task creation data updated'
        )
    }

    /**
     * Get task creation data for a user
     */
    get(userId: string): TaskCreationData | undefined {
        return this.store.get(userId)
    }

    /**
     * Get specific field from task creation data
     */
    getField<K extends keyof TaskCreationData>(
        userId: string,
        field: K
    ): TaskCreationData[K] | undefined {
        const data = this.store.get(userId)
        return data?.[field]
    }

    /**
     * Check if user has task creation data
     */
    has(userId: string): boolean {
        return this.store.has(userId)
    }

    /**
     * Clear task creation data for a user
     */
    clear(userId: string): boolean {
        const existed = this.store.has(userId)
        this.store.delete(userId)

        if (existed) {
            logger.debug({ userId }, 'Task creation data cleared')
        }

        return existed
    }

    /**
     * Clear all task creation data (for testing/cleanup)
     */
    clearAll(): void {
        const count = this.store.size
        this.store.clear()
        logger.info({ count }, 'All task creation data cleared')
    }

    /**
     * Get store size (number of users with pending task creation)
     */
    size(): number {
        return this.store.size
    }

    /**
     * Validate that all required fields are present
     */
    validateComplete(userId: string): {
        valid: boolean
        missingFields: string[]
    } {
        const data = this.store.get(userId)

        if (!data) {
            return {
                valid: false,
                missingFields: ['all fields (no data found)'],
            }
        }

        const requiredFields: (keyof TaskCreationData)[] = [
            'customerUsername',
            'taskType',
            'taskMessage',
            'workerIds',
            'sendWhatsApp',
        ]

        const missingFields = requiredFields.filter((field) => {
            const value = data[field]
            return value === undefined || value === null || value === ''
        })

        return {
            valid: missingFields.length === 0,
            missingFields,
        }
    }

    /**
     * Debug: Log all data for a user
     */
    debug(userId: string): void {
        const data = this.store.get(userId)
        logger.info({ userId, data }, 'Task creation data dump')
    }
}
