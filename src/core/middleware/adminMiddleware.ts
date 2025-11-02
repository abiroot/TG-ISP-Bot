/**
 * Centralized Admin Middleware
 *
 * Provides consistent admin access control for all admin-only flows.
 * Eliminates duplication of inline admin checks across multiple flows.
 *
 * Usage in flows:
 * ```typescript
 * import { runAdminMiddleware } from '~/core/middleware/adminMiddleware'
 *
 * export const myAdminFlow = addKeyword(['/admin-command']).addAction(
 *     async (ctx, utils) => {
 *         const result = await runAdminMiddleware(ctx, utils)
 *         if (!result.allowed) return
 *
 *         // Admin-only logic here...
 *     }
 * )
 * ```
 */

import { loggers } from '~/core/utils/logger'

const logger = loggers.app.child({ middleware: 'admin' })

/**
 * Result of admin middleware check
 */
export interface AdminMiddlewareResult {
    /**
     * Whether the user is allowed to proceed
     */
    allowed: boolean

    /**
     * User's Telegram ID (for logging)
     */
    userId?: string
}

/**
 * Centralized admin access control middleware
 *
 * Checks if user is an admin (either hardcoded in config or has admin role in database).
 * Automatically sends denial message if user is not an admin.
 *
 * @param ctx - Bot context with from field
 * @param utils - Flow utils containing extensions
 * @returns AdminMiddlewareResult with allowed status
 */
export async function runAdminMiddleware(
    ctx: { from: string; body?: string },
    utils: {
        flowDynamic: (message: string) => Promise<void>
        extensions?: Record<string, any>
    }
): Promise<AdminMiddlewareResult> {
    const { flowDynamic, extensions } = utils

    if (!extensions?.userManagementService) {
        logger.error('userManagementService not available in extensions')
        await flowDynamic('⚠️ Service unavailable. Please try again later.')
        return { allowed: false }
    }

    const { userManagementService } = extensions

    try {
        const isAdmin = await userManagementService.isAdmin(ctx.from)

        if (!isAdmin) {
            logger.warn(
                {
                    userId: ctx.from,
                    command: ctx.body?.substring(0, 50) || 'unknown',
                },
                'Non-admin user attempted admin command'
            )

            await flowDynamic('⚠️ This command is only available to administrators.')
            return { allowed: false, userId: ctx.from }
        }

        logger.debug({ userId: ctx.from }, 'Admin access granted')

        return { allowed: true, userId: ctx.from }
    } catch (error) {
        logger.error(
            {
                err: error,
                userId: ctx.from,
            },
            'Error during admin middleware check'
        )

        await flowDynamic('⚠️ Error checking permissions. Please try again.')
        return { allowed: false }
    }
}
