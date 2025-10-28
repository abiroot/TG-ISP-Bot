import { rateLimiter } from '~/utils/rateLimiter'
import { BotCtx, BotUtils, MiddlewareHandler } from '~/types'
import { personalityService } from '~/services/personalityService'
import { isAdmin } from '~/config/admins'

/**
 * Middleware to enforce rate limiting
 * Admins are exempted from rate limiting
 */
export const requireRateLimit: MiddlewareHandler = async (ctx: BotCtx, utils: BotUtils): Promise<boolean> => {
    // Admins bypass rate limiting
    if (isAdmin(ctx.from)) {
        return true
    }

    const contextId = personalityService.getContextId(ctx.from)

    // Check rate limit
    const allowed = rateLimiter.check(contextId, {
        maxRequests: 20, // 20 messages
        windowMs: 60 * 1000, // per minute
        blockDurationMs: 5 * 60 * 1000, // block for 5 minutes
    })

    if (!allowed) {
        const status = rateLimiter.getStatus(contextId)

        if (status.blocked && status.unblockTime) {
            const remainingSec = Math.ceil((status.unblockTime - Date.now()) / 1000)
            await utils.flowDynamic(
                `⚠️ You're sending messages too quickly. Please wait ${remainingSec} seconds before trying again.`
            )
        } else {
            await utils.flowDynamic(
                `⚠️ Rate limit exceeded. Please wait a minute before sending more messages.\n\n` +
                    `You've sent ${status.count}/${status.maxRequests} messages in the last minute.`
            )
        }

        return false
    }

    return true
}

/**
 * Get rate limit status for a user
 */
export const getRateLimitStatus = (contextId: string) => {
    return rateLimiter.getStatus(contextId)
}

/**
 * Reset rate limit for a user (admin function)
 */
export const resetRateLimit = (contextId: string) => {
    rateLimiter.reset(contextId)
}

/**
 * Unblock a user (admin function)
 */
export const unblockUser = (contextId: string) => {
    rateLimiter.unblock(contextId)
}
