import type { BotMethods } from '@builderbot/bot/dist/types'
import { MessageLogger } from '~/middleware/messageLogger'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('flow-helpers')

export interface MessageOptions {
    media?: string
    metadata?: Record<string, any>
}

/**
 * Helper to send a message and log it automatically
 *
 * This helper eliminates the need for try-catch blocks around message logging
 * in flows, providing a consistent pattern for sending and logging messages.
 *
 * @param ctx - Bot context
 * @param utils - Bot utils
 * @param message - Message(s) to send
 * @param options - Optional media and metadata
 *
 * @example
 * ```ts
 * // Simple message
 * await sendAndLog(ctx, utils, 'Hello!')
 *
 * // Multiple messages
 * await sendAndLog(ctx, utils, ['Hello!', 'How are you?'])
 *
 * // With metadata
 * await sendAndLog(ctx, utils, 'User found', {
 *     metadata: { method: 'getUserInfo', userId: 123 }
 * })
 *
 * // With media
 * await sendAndLog(ctx, utils, 'Check this image', {
 *     media: 'https://example.com/image.png'
 * })
 * ```
 */
export async function sendAndLog(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string | string[],
    options?: MessageOptions
): Promise<void> {
    try {
        // Send the message
        if (options?.media) {
            await utils.flowDynamic([{ body: Array.isArray(message) ? message.join('\n') : message, media: options.media }])
        } else {
            await utils.flowDynamic(message)
        }

        // Log each message
        const messages = Array.isArray(message) ? message : [message]
        for (const msg of messages) {
            await MessageLogger.logOutgoing(
                ctx.from,
                ctx.from,
                msg,
                options?.media,
                options?.metadata
            )
        }
    } catch (error) {
        logger.error({ err: error, message, options }, 'Failed to send and log message')
        throw error
    }
}

/**
 * Helper to send and log a message with error handling
 *
 * Similar to sendAndLog but catches errors and logs them instead of throwing.
 * Useful in contexts where message sending is not critical to flow execution.
 *
 * @returns true if successful, false if failed
 */
export async function trySendAndLog(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string | string[],
    options?: MessageOptions
): Promise<boolean> {
    try {
        await sendAndLog(ctx, utils, message, options)
        return true
    } catch (error) {
        logger.error({ err: error, message }, 'Failed to send and log message (non-critical)')
        return false
    }
}

/**
 * Wrapper for flowDynamic that automatically logs
 *
 * Creates a logging version of flowDynamic bound to a specific context
 *
 * @example
 * ```ts
 * const loggedFlowDynamic = createLoggingFlowDynamic(ctx, utils)
 * await loggedFlowDynamic('Hello!')
 * await loggedFlowDynamic(['Line 1', 'Line 2'])
 * ```
 */
export function createLoggingFlowDynamic(ctx: any, utils: BotMethods<any, any>) {
    return async (message: string | string[], options?: MessageOptions) => {
        await sendAndLog(ctx, utils, message, options)
    }
}

/**
 * Get context ID from context
 *
 * Helper to consistently extract context_id across the codebase
 */
export function getContextId(ctx: any): string {
    return ctx.from
}

/**
 * Format phone number for display
 *
 * Helper to consistently format phone numbers for messages
 */
export function formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '')

    // Format as +961 XX XXX XXX (Lebanese format) if it matches
    if (cleaned.length === 11 && cleaned.startsWith('961')) {
        return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`
    }

    // Format as +XXX XX XXX XXXX (international format) if it starts with country code
    if (cleaned.length >= 10) {
        return `+${cleaned}`
    }

    // Return as-is if doesn't match known formats
    return phoneNumber
}
