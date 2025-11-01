import { messageService } from '~/core/services/messageService'
import type { BotCtx, ExtendedJsonValue } from '~/types'
import { loggers } from '~/core/utils/logger'

/**
 * Global message logger for event-based message logging
 *
 * Used in src/app.ts event handlers:
 * - provider.on('message') → logIncoming()
 * - provider.on('send_message') → logOutgoing()
 *
 * Note: Manual middleware functions removed (logIncomingMessage, flowDynamicWithLogging, createLoggingUtils)
 * as they are replaced by automatic event-based logging in app.ts
 */
export class MessageLogger {
    /**
     * Log incoming message
     */
    static async logIncoming(ctx: BotCtx): Promise<void> {
        try {
            await messageService.logIncomingMessage(ctx)
        } catch (error) {
            loggers.telegram.error({ err: error }, 'Failed to log incoming message')
        }
    }

    /**
     * Log outgoing message
     */
    static async logOutgoing(
        contextId: string,
        recipient: string,
        content: string,
        messageId?: string,
        metadata?: Record<string, ExtendedJsonValue>
    ): Promise<void> {
        try {
            await messageService.logOutgoingMessage(contextId, recipient, content, messageId, metadata)
        } catch (error) {
            loggers.telegram.error({ err: error }, 'Failed to log outgoing message')
        }
    }

    /**
     * Log media message
     */
    static async logMedia(
        contextId: string,
        recipient: string,
        content: string | undefined,
        mediaUrl: string,
        mediaType: string,
        messageId?: string,
        metadata?: Record<string, ExtendedJsonValue>
    ): Promise<void> {
        try {
            await messageService.logOutgoingMediaMessage(
                contextId,
                recipient,
                content,
                mediaUrl,
                mediaType,
                messageId,
                metadata
            )
        } catch (error) {
            loggers.telegram.error({ err: error }, 'Failed to log media message')
        }
    }
}
