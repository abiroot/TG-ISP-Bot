/**
 * Message Debouncer Utility
 *
 * Handles rapid message accumulation to prevent duplicate bot responses
 * Based on BuilderBot best practices for handling "fast entries"
 */

import { createFlowLogger } from './logger'

const logger = createFlowLogger('messageDebouncer')

interface MessageQueueItem {
    messages: string[]
    timerId: NodeJS.Timeout
    callback: (accumulatedMessages: string[]) => Promise<void>
}

class MessageDebouncerManager {
    private queues: Map<string, MessageQueueItem> = new Map()
    private readonly DEFAULT_GAP_TIME = 3000 // 3 seconds

    /**
     * Add a message to the queue for a user
     * If multiple messages arrive within the gap time, they are accumulated
     */
    addMessage(
        contextId: string,
        message: string,
        callback: (accumulatedMessages: string[]) => Promise<void>,
        gapTime: number = this.DEFAULT_GAP_TIME
    ): void {
        const existing = this.queues.get(contextId)

        if (existing) {
            // Message already in queue - add to accumulation and reset timer
            existing.messages.push(message)
            clearTimeout(existing.timerId)

            // Create new timer
            const timerId = setTimeout(async () => {
                await this.processQueue(contextId)
            }, gapTime)

            existing.timerId = timerId
            logger.debug({ contextId, messageCount: existing.messages.length }, 'Message accumulated')
        } else {
            // First message - create new queue entry
            const timerId = setTimeout(async () => {
                await this.processQueue(contextId)
            }, gapTime)

            this.queues.set(contextId, {
                messages: [message],
                timerId,
                callback,
            })
            logger.debug({ contextId }, 'First message queued')
        }
    }

    /**
     * Process accumulated messages for a context
     */
    private async processQueue(contextId: string): Promise<void> {
        const queueItem = this.queues.get(contextId)

        if (!queueItem) {
            return
        }

        try {
            logger.info({ contextId, messageCount: queueItem.messages.length }, 'Processing accumulated messages')
            await queueItem.callback(queueItem.messages)
        } catch (error) {
            logger.error({ err: error, contextId }, 'Error processing message queue')
        } finally {
            // Clean up
            this.queues.delete(contextId)
        }
    }

    /**
     * Cancel pending queue for a context
     */
    cancel(contextId: string): void {
        const queueItem = this.queues.get(contextId)

        if (queueItem) {
            clearTimeout(queueItem.timerId)
            this.queues.delete(contextId)
            logger.debug({ contextId }, 'Queue cancelled')
        }
    }

    /**
     * Check if messages are being accumulated for a context
     */
    isPending(contextId: string): boolean {
        return this.queues.has(contextId)
    }

    /**
     * Get accumulated message count for a context
     */
    getQueueSize(contextId: string): number {
        return this.queues.get(contextId)?.messages.length ?? 0
    }

    /**
     * Clear all queues
     */
    clearAll(): void {
        for (const queueItem of this.queues.values()) {
            clearTimeout(queueItem.timerId)
        }
        this.queues.clear()
        logger.info('All message queues cleared')
    }
}

// Export singleton instance
export const messageDebouncer = new MessageDebouncerManager()
