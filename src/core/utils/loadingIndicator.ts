/**
 * Loading Indicator Manager
 *
 * Centralized utility for managing loading indicators in Telegram conversations.
 * Handles showing, updating (for retries), and hiding loading messages.
 *
 * Usage:
 * ```typescript
 * const indicator = await LoadingIndicator.show(provider, ctx.from)
 * // ... perform async operation ...
 * await LoadingIndicator.hide(provider, ctx.from, indicator)
 * ```
 */

import { createFlowLogger } from './logger'

const logger = createFlowLogger('loadingIndicator')

export interface LoadingMessage {
    message_id: number
    chat_id: string
}

export class LoadingIndicator {
    /**
     * Show a loading indicator message
     *
     * @param provider - BuilderBot provider instance
     * @param chatId - Telegram chat ID
     * @param message - Custom loading message (default: '💭 Thinking...')
     * @returns Loading message object or null if failed
     */
    static async show(
        provider: any,
        chatId: string,
        message: string = '💭 Thinking...'
    ): Promise<LoadingMessage | null> {
        try {
            const loadingMsg = await provider.vendor.telegram.sendMessage(chatId, message, {
                parse_mode: 'HTML',
            })

            logger.debug({ chatId, messageId: loadingMsg.message_id }, 'Loading indicator shown')

            return {
                message_id: loadingMsg.message_id,
                chat_id: chatId,
            }
        } catch (error) {
            logger.warn({ err: error, chatId }, 'Failed to send loading indicator')
            return null
        }
    }

    /**
     * Update loading indicator during retry attempts
     *
     * @param provider - BuilderBot provider instance
     * @param loadingMsg - Loading message object from show()
     * @param attempt - Current retry attempt number (0-indexed)
     * @param maxRetries - Maximum number of retries
     */
    static async update(
        provider: any,
        loadingMsg: LoadingMessage | null,
        attempt: number,
        maxRetries: number = 3
    ): Promise<void> {
        if (!loadingMsg) return

        try {
            await provider.vendor.telegram.editMessageText(
                loadingMsg.chat_id,
                loadingMsg.message_id,
                undefined,
                `💭 Thinking... (attempt ${attempt + 1}/${maxRetries})`,
                { parse_mode: 'HTML' }
            )

            logger.debug(
                { chatId: loadingMsg.chat_id, attempt, maxRetries },
                'Loading indicator updated for retry'
            )
        } catch (error) {
            // Ignore edit errors (message might have been deleted, or edit failed due to same content)
            logger.debug({ err: error, chatId: loadingMsg.chat_id }, 'Failed to update loading indicator')
        }
    }

    /**
     * Hide (delete) loading indicator
     *
     * @param provider - BuilderBot provider instance
     * @param loadingMsg - Loading message object from show()
     */
    static async hide(provider: any, loadingMsg: LoadingMessage | null): Promise<void> {
        if (!loadingMsg) return

        try {
            await provider.vendor.telegram.deleteMessage(loadingMsg.chat_id, loadingMsg.message_id)

            logger.debug({ chatId: loadingMsg.chat_id, messageId: loadingMsg.message_id }, 'Loading indicator hidden')
        } catch (error) {
            logger.warn(
                { err: error, chatId: loadingMsg.chat_id, messageId: loadingMsg.message_id },
                'Failed to delete loading indicator'
            )
        }
    }

    /**
     * Helper for creating an onRetry callback for withRetry utility
     *
     * @param provider - BuilderBot provider instance
     * @param loadingMsg - Loading message object from show()
     * @param maxRetries - Maximum number of retries (default: 3)
     * @returns onRetry callback function
     */
    static createRetryHandler(
        provider: any,
        loadingMsg: LoadingMessage | null,
        maxRetries: number = 3
    ): (attempt: number) => Promise<void> {
        return async (attempt: number) => {
            await LoadingIndicator.update(provider, loadingMsg, attempt, maxRetries)
        }
    }
}
