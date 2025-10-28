import { whitelistService } from '~/services/whitelistService'
import { personalityService } from '~/services/personalityService'
import { userService } from '~/services/userService'
import { BotCtx, BotUtils, MiddlewareHandler } from '~/types'

/**
 * Middleware to check if the context is whitelisted
 * Returns true if whitelisted, false otherwise
 *
 * Enhanced to support username whitelisting by checking both:
 * 1. Direct numeric ID match (current behavior)
 * 2. Username match via user identifier mapping
 */
export const checkWhitelist: MiddlewareHandler = async (ctx: BotCtx, utils: BotUtils): Promise<boolean> => {
    const contextId = personalityService.getContextId(ctx.from)
    const contextType = personalityService.getContextType(ctx.from)
    const isGroup = contextType === 'group'

    // First, check direct whitelist match (current behavior)
    let whitelisted = await whitelistService.isWhitelisted(contextId, isGroup)

    // If not whitelisted and it's a private chat, try username matching
    if (!whitelisted && !isGroup) {
        try {
            // Get user's username from our mapping
            const user = await userService.getUserByTelegramId(contextId)
            if (user?.username) {
                // Check if the username is whitelisted
                whitelisted = await whitelistService.isWhitelisted(`@${user.username}`, false)
            }
        } catch (error) {
            // Log error but don't block the user
            console.warn('⚠️  Failed to check username whitelist:', error)
        }
    }

    if (!whitelisted) {
        // Silently ignore non-whitelisted messages (don't send a response)
        return false
    }

    return true
}

/**
 * Middleware to enforce whitelist requirement
 * Silently blocks messages from non-whitelisted contexts
 */
export const requireWhitelist: MiddlewareHandler = async (ctx: BotCtx, utils: BotUtils): Promise<boolean> => {
    return await checkWhitelist(ctx, utils)
}
