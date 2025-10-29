import { addKeyword } from '@builderbot/bot'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { requireAdmin } from '~/middleware/adminCheck'
import { rateLimiter } from '~/utils/rateLimiter'
import { personalityService } from '~/services/personalityService'

/**
 * Check Rate Limit Status Flow
 */
export const rateLimitStatusFlow = addKeyword<Provider, Database>(['ratelimit status', '/ratelimit status'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        await utils.flowDynamic(
            'Send the phone number or group ID to check (e.g., +96171711101 or 123456789@g.us)\n' +
                'Or send "self" to check your own status.'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const input = ctx.body.trim()

        let contextId: string
        if (input.toLowerCase() === 'self') {
            contextId = personalityService.getContextId(ctx.from)
        } else {
            contextId = input
        }

        const status = rateLimiter.getStatus(contextId)

        let message = `📊 *Rate Limit Status*\n\n`
        message += `Context: ${contextId}\n\n`
        message += `Requests: ${status.count}/${status.maxRequests}\n`
        message += `Remaining: ${status.remaining}\n`
        message += `Window: ${Math.ceil(status.windowMs / 1000)}s\n`
        message += `Window Age: ${Math.ceil((status.windowAge || 0) / 1000)}s\n`
        message += `Blocked: ${status.blocked ? '🔴 YES' : '🟢 NO'}\n`

        if (status.blocked && status.unblockTime) {
            const remainingSec = Math.ceil((status.unblockTime - Date.now()) / 1000)
            message += `Unblock In: ${remainingSec}s\n`
        }

        await utils.flowDynamic(message)
    })

/**
 * Reset Rate Limit Flow
 */
export const resetRateLimitFlow = addKeyword<Provider, Database>(['ratelimit reset', '/ratelimit reset'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        await utils.flowDynamic(
            'Send the phone number or group ID to reset (e.g., +96171711101 or 123456789@g.us)\n' +
                'Or send "all" to reset ALL rate limits (use with caution!).'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const input = ctx.body.trim()

        if (input.toLowerCase() === 'all') {
            rateLimiter.clearAll()
            await utils.flowDynamic('✅ All rate limits have been reset.')
            return
        }

        rateLimiter.reset(input)
        await utils.flowDynamic(`✅ Rate limit reset for: ${input}`)
    })

/**
 * Unblock User Flow
 */
export const unblockUserFlow = addKeyword<Provider, Database>(['ratelimit unblock', '/ratelimit unblock'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        if (!(await requireAdmin(ctx, utils))) return

        const blocked = rateLimiter.getBlockedUsers()

        if (blocked.length === 0) {
            await utils.flowDynamic('ℹ️ No users are currently blocked.')
            return
        }

        let message = `🚫 *Blocked Users (${blocked.length})*\n\n`
        blocked.forEach((contextId, i) => {
            message += `${i + 1}. ${contextId}\n`
        })
        message += '\nSend the phone number or group ID to unblock (e.g., +96171711101)'

        await utils.flowDynamic(message)
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const input = ctx.body.trim()

        rateLimiter.unblock(input)
        await utils.flowDynamic(`✅ User unblocked: ${input}`)
    })
