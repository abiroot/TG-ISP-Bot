import { isAdmin } from '~/config/admins'
import { BotCtx, BotUtils } from '~/types'

/**
 * Middleware to check if the user is an admin
 * Returns true if admin, false otherwise
 */
export async function checkAdmin(ctx: BotCtx, utils: BotUtils): Promise<boolean> {
    const phoneNumber = ctx.from
    return isAdmin(phoneNumber)
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
