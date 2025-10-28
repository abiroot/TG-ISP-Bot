import { personalityService } from '~/services/personalityService'
import { Personality } from '~/database/schemas/personality'
import { BotCtx, BotUtils } from '~/types'

/**
 * Middleware to check if the context has a personality configured
 * Returns the personality if it exists, null otherwise
 */
export async function getPersonality(ctx: BotCtx, utils: BotUtils): Promise<Personality | null> {
    const contextId = personalityService.getContextId(ctx.from)
    return await personalityService.getPersonality(contextId)
}

/**
 * Middleware to check if personality exists
 * Returns true if exists, false otherwise
 */
export async function hasPersonality(ctx: BotCtx, utils: BotUtils): Promise<boolean> {
    const contextId = personalityService.getContextId(ctx.from)
    return await personalityService.hasPersonality(contextId)
}

/**
 * Middleware to require personality setup
 * Returns false and triggers setup flow if personality doesn't exist
 */
export async function requirePersonality(ctx: BotCtx, utils: BotUtils): Promise<boolean> {
    const exists = await hasPersonality(ctx, utils)

    if (!exists) {
        // Personality doesn't exist, should trigger setup
        return false
    }

    return true
}
