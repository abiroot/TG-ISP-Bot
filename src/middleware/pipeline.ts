/**
 * Centralized Middleware Pipeline
 *
 * Eliminates code duplication by running common middleware checks in a single place
 * Based on BuilderBot best practices for middleware composition
 */

import { BotCtx, BotUtils } from '~/types'
import { requireWhitelist } from './whitelistCheck'
import { requireRateLimit } from './rateLimitCheck'
import { getPersonality } from './personalityCheck'
import { requireAdmin, checkAdmin } from './adminCheck'
import { botStateService } from '~/services/botStateService'
import { Personality } from '~/database/schemas/personality'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('middleware')

export interface MiddlewareResult {
    allowed: boolean
    personality?: Personality
    isAdmin?: boolean
    reason?: string
}

export interface MiddlewareOptions {
    requireWhitelist?: boolean
    requireRateLimit?: boolean
    requirePersonality?: boolean
    requireAdmin?: boolean
    checkMaintenance?: boolean
    bypassForAdmins?: boolean // Allow admins to bypass some checks
}

const DEFAULT_OPTIONS: MiddlewareOptions = {
    requireWhitelist: true,
    requireRateLimit: true,
    requirePersonality: true,
    requireAdmin: false,
    checkMaintenance: true,
    bypassForAdmins: true,
}

/**
 * Run middleware pipeline with specified checks
 * Returns early if any check fails
 */
export async function runMiddleware(
    ctx: BotCtx,
    utils: BotUtils,
    options: MiddlewareOptions = {}
): Promise<MiddlewareResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const userIsAdmin = await checkAdmin(ctx, utils)

    logger.debug({ from: ctx.from, isAdmin: userIsAdmin, options: opts }, 'Running middleware pipeline')

    // Admin check (if required)
    if (opts.requireAdmin) {
        if (!userIsAdmin) {
            logger.warn({ from: ctx.from }, 'Admin check failed')
            await utils.flowDynamic('⚠️ This command is only available to administrators.')
            return { allowed: false, reason: 'not_admin' }
        }
        logger.debug({ from: ctx.from }, 'Admin check passed')
        return { allowed: true, isAdmin: true }
    }

    // Maintenance mode check (allow admins to bypass)
    if (opts.checkMaintenance && (await botStateService.isMaintenanceMode())) {
        if (!userIsAdmin || !opts.bypassForAdmins) {
            logger.info({ from: ctx.from }, 'Bot in maintenance mode')
            await utils.flowDynamic(await botStateService.getMaintenanceMessage())
            return { allowed: false, reason: 'maintenance_mode' }
        }
        logger.debug({ from: ctx.from }, 'Admin bypassed maintenance mode')
    }

    // Rate limit check (admins can bypass)
    if (opts.requireRateLimit) {
        if (!userIsAdmin || !opts.bypassForAdmins) {
            const rateLimitPassed = await requireRateLimit(ctx, utils)
            if (!rateLimitPassed) {
                logger.warn({ from: ctx.from }, 'Rate limit check failed')
                return { allowed: false, reason: 'rate_limited' }
            }
        } else {
            logger.debug({ from: ctx.from }, 'Admin bypassed rate limit')
        }
    }

    // Whitelist check (admins can bypass)
    if (opts.requireWhitelist) {
        const whitelisted = await requireWhitelist(ctx, utils)
        if (!whitelisted) {
            if (!userIsAdmin || !opts.bypassForAdmins) {
                logger.warn({ from: ctx.from }, 'Whitelist check failed')
                return { allowed: false, reason: 'not_whitelisted' }
            }
            logger.debug({ from: ctx.from }, 'Admin bypassed whitelist')
        }
    }

    // Personality check
    // Note: For first-time users, personality check is now handled in welcomeFlow
    // before middleware is called, so this should only run for existing users
    let personality: Personality | undefined
    if (opts.requirePersonality) {
        personality = await getPersonality(ctx, utils)
        if (!personality) {
            logger.info({ from: ctx.from }, 'Personality not found')
            // First-time users should be routed in welcomeFlow before reaching here
            // This is a safety fallback in case personality was deleted mid-conversation
            return { allowed: false, reason: 'no_personality' }
        }
        logger.debug({ from: ctx.from, botName: personality.bot_name }, 'Personality found')
    }

    logger.debug({ from: ctx.from }, 'All middleware checks passed')
    return {
        allowed: true,
        personality,
        isAdmin: userIsAdmin,
    }
}

/**
 * Convenience function for standard user flows (whitelist + rate limit + personality)
 */
export async function runUserMiddleware(ctx: BotCtx, utils: BotUtils): Promise<MiddlewareResult> {
    return runMiddleware(ctx, utils, {
        requireWhitelist: true,
        requireRateLimit: true,
        requirePersonality: true,
        checkMaintenance: true,
        bypassForAdmins: true,
    })
}

/**
 * Convenience function for admin flows (admin check only)
 */
export async function runAdminMiddleware(ctx: BotCtx, utils: BotUtils): Promise<MiddlewareResult> {
    return runMiddleware(ctx, utils, {
        requireAdmin: true,
        requireWhitelist: false,
        requireRateLimit: false,
        requirePersonality: false,
        checkMaintenance: false,
    })
}

/**
 * Convenience function for media flows (whitelist + personality, no rate limit due to debouncer)
 */
export async function runMediaMiddleware(ctx: BotCtx, utils: BotUtils): Promise<MiddlewareResult> {
    return runMiddleware(ctx, utils, {
        requireWhitelist: true,
        requireRateLimit: false, // Handled by debouncer
        requirePersonality: true,
        checkMaintenance: true,
        bypassForAdmins: true,
    })
}
