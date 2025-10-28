import { messageService } from '~/services/messageService'
import { BotCtx, BotUtils } from '~/types'

/**
 * Middleware to log incoming messages
 * Call this at the beginning of each flow
 */
export async function logIncomingMessage(ctx: BotCtx, utils: BotUtils): Promise<void> {
    try {
        await messageService.logIncomingMessage(ctx)
        console.log(`📥 Logged incoming message from ${ctx.from}`)
    } catch (error) {
        console.error('❌ Failed to log incoming message:', error)
        // Don't throw - we don't want to break the flow if logging fails
    }
}

/**
 * Wrapper for flowDynamic to log outgoing messages
 * Use this instead of flowDynamic directly
 */
export async function flowDynamicWithLogging(
    ctx: BotCtx,
    utils: BotUtils,
    message: string | string[]
): Promise<void> {
    try {
        // Send the message
        await utils.flowDynamic(message)

        // Log each message
        const messages = Array.isArray(message) ? message : [message]
        for (const msg of messages) {
            await messageService.logOutgoingMessage(ctx.from, ctx.from, msg, undefined, {
                method: 'flowDynamic',
            })
        }

        console.log(`📤 Logged outgoing message to ${ctx.from}`)
    } catch (error) {
        console.error('❌ Failed to send/log outgoing message:', error)
        throw error // We DO want to throw here since message sending failed
    }
}

/**
 * Create a wrapper for bot utils that automatically logs messages
 */
export function createLoggingUtils(ctx: BotCtx, utils: BotUtils): BotUtils & {
    flowDynamicLogged: (message: string | string[]) => Promise<void>
} {
    return {
        ...utils,
        flowDynamicLogged: async (message: string | string[]) => {
            await flowDynamicWithLogging(ctx, utils, message)
        },
    }
}

/**
 * Global message logger that can be called from anywhere
 * Logs both incoming and outgoing messages automatically
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
