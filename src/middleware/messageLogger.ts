import { messageService } from '~/services/messageService'

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
    static async logIncoming(ctx: any): Promise<void> {
        try {
            await messageService.logIncomingMessage(ctx)
        } catch (error) {
            console.error('Failed to log incoming message:', error)
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
        metadata?: Record<string, any>
    ): Promise<void> {
        try {
            await messageService.logOutgoingMessage(contextId, recipient, content, messageId, metadata)
        } catch (error) {
            console.error('Failed to log outgoing message:', error)
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
        metadata?: Record<string, any>
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
            console.error('Failed to log media message:', error)
        }
    }
}
