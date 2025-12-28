/**
 * Search Activity Flow - Admin Command
 *
 * Shows search activity of workers/collectors over the last 7 days.
 * Provides admin visibility into who is searching for which customers.
 *
 * Commands:
 * - /searches or searches - Show search activity report
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { runAdminMiddleware } from '~/core/middleware/adminMiddleware'
import { searchActivityService } from '~/features/admin/services/SearchActivityService'

const logger = createFlowLogger('SearchActivityFlow')

/**
 * Format date for display
 */
function formatDate(date: Date): string {
    return new Date(date).toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
}

/**
 * Format date only (no time)
 */
function formatDateOnly(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: '2-digit',
        day: '2-digit',
    })
}

/**
 * Search Activity Report Flow
 *
 * Command: /searches or searches
 */
export const searchActivityFlow = addKeyword<TelegramProvider, Database>([
    '/searches',
    'searches',
    '/search-activity',
    'search activity',
]).addAction(async (ctx, utils) => {
    const { flowDynamic } = utils

    // Admin check (centralized middleware)
    const adminCheck = await runAdminMiddleware(ctx, utils)
    if (!adminCheck.allowed) return

    logger.info({ from: ctx.from }, 'Search activity report requested')

    try {
        // Get 7-day search report
        const report = await searchActivityService.getSearchReport(7)

        // Build message
        let message = '<b>🔍 Search Activity Report</b>\n\n'

        // Summary section
        message += '<b>📊 7-Day Summary</b>\n'
        message += `├ Total Searches: <b>${report.summary.totalSearches}</b>\n`
        message += `├ Unique Users: <b>${report.summary.uniqueUsers}</b>\n`
        message += `├ Successful: <b>${report.summary.successfulSearches}</b>\n`
        message += `└ Success Rate: <b>${report.summary.successRate}%</b>\n\n`

        // User breakdown section
        if (report.userSummaries.length > 0) {
            message += '<b>👥 Activity by User</b>\n'

            for (const user of report.userSummaries.slice(0, 10)) {
                const displayName = user.worker_username || user.user_display_name || 'Unknown'
                const successRate = user.total_searches > 0
                    ? Math.round((user.successful_searches / user.total_searches) * 100)
                    : 0

                message += `\n• <b>${html.escape(displayName)}</b>\n`
                message += `  ├ Searches: ${user.total_searches}\n`
                message += `  ├ Unique IDs: ${user.unique_identifiers}\n`
                message += `  ├ Success: ${successRate}%\n`
                message += `  └ Last: ${formatDate(user.last_search_at)}\n`
            }

            if (report.userSummaries.length > 10) {
                message += `\n<i>...and ${report.userSummaries.length - 10} more users</i>\n`
            }
        } else {
            message += '<i>No search activity in the last 7 days.</i>\n'
        }

        // Daily breakdown section
        if (report.dailyBreakdown.length > 0) {
            message += '\n<b>📅 Daily Breakdown</b>\n'

            for (const day of report.dailyBreakdown) {
                message += `├ ${formatDateOnly(day.date)}: `
                message += `${day.total_searches} searches by ${day.unique_users} users\n`
            }
        }

        // Recent searches section (last 5)
        if (report.recentSearches.length > 0) {
            message += '\n<b>🕐 Recent Searches</b>\n'

            for (const search of report.recentSearches.slice(0, 5)) {
                const user = search.worker_username || search.user_display_name || 'Unknown'
                const status = search.search_successful ? '✓' : '✗'

                message += `├ ${status} <b>${html.escape(user)}</b> → `
                message += `<code>${html.escape(search.search_identifier)}</code>`
                if (search.results_count > 0) {
                    message += ` (${search.results_count})`
                }
                message += '\n'
            }
        }

        // Footer
        message += '\n<b>Related Commands:</b>\n'
        message += '• <code>/users</code> - List all telegram users\n'
        message += '• <code>/list roles</code> - Show role assignments'

        // Send with HTML formatting
        const provider = utils.provider as TelegramProvider
        await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })

        logger.info(
            {
                from: ctx.from,
                totalSearches: report.summary.totalSearches,
                uniqueUsers: report.summary.uniqueUsers,
            },
            'Search activity report sent'
        )
    } catch (error) {
        logger.error({ err: error, from: ctx.from }, 'Failed to generate search activity report')
        await flowDynamic('❌ Failed to generate search activity report. Please check the logs.')
    }
})
