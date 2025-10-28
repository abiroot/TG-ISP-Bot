import type { BotMethods } from '@builderbot/bot/dist/types'
import { MessageLogger } from '~/middleware/messageLogger'

/**
 * Helper to send a message and log it automatically
 */
export async function sendAndLog(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string | string[]
): Promise<void> {
    // Send the message
    await utils.flowDynamic(message)

    // Log each message
    const messages = Array.isArray(message) ? message : [message]
    for (const msg of messages) {
        await MessageLogger.logOutgoing(ctx.from, ctx.from, msg)
    }
}

/**
 * Wrapper for flowDynamic that automatically logs
 */
export function createLoggingFlowDynamic(ctx: any, utils: BotMethods<any, any>) {
    return async (message: string | string[]) => {
        await sendAndLog(ctx, utils, message)
    }
}
