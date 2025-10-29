import { isAdmin } from '~/config/admins'
import { userService } from '~/services/userService'
import { BotCtx, BotUtils } from '~/types'

/**
 * Middleware to check if the user is an admin
 * Returns true if admin, false otherwise
 *
 * Enhanced to support username admin verification by checking both:
 * 1. Direct numeric ID match (current behavior)
 * 2. Username match via user identifier mapping
 */
export async function checkAdmin(ctx: BotCtx, utils: BotUtils): Promise<boolean> {
    const telegramId = ctx.from

    // First, check direct admin match (current behavior)
    if (isAdmin(telegramId)) {
        return true
    }

    // If not admin by ID, try username matching
    try {
        // Get user's username from our mapping
        const username = await userService.getUsernameForTelegramId(telegramId)
        if (username) {
            // Check if the username is an admin (try both with and without @)
            return isAdmin(`@${username}`) || isAdmin(username)
        }
    } catch (error) {
        // Log error but don't block the admin check
        console.warn('⚠️  Failed to check username admin:', error)
    }

    return false
}

/**
 * Middleware to restrict access to admins only
 * Sends a message and returns false if not admin
 */
export async function requireAdmin(ctx: BotCtx, utils: BotUtils): Promise<boolean> {
    const admin = await checkAdmin(ctx, utils)

    if (!admin) {
        await utils.flowDynamic('⛔ This command is only available to administrators.')
        return false
    }

    return true
}
