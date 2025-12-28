/**
 * Customer Statistics Flow
 *
 * Shows bandwidth usage chart when user clicks "Statistics" button.
 * Fetches data from ISP API /user-stat?mobile={identifier} endpoint.
 * Generates a chart image and sends it to Telegram.
 *
 * Access: Admin and Worker roles only
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'
import {
    generateBandwidthChart,
    calculateStats,
    formatStatsMessage,
} from '../utils/chartGenerator'

const logger = createFlowLogger('customer-statistics')

/**
 * Handle statistics button click
 * Button format: customer_stats:{identifier}
 */
export const customerStatisticsFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_STATS')
    .addAction(async (ctx, { extensions, provider, endFlow }) => {
        const { ispService, roleService } = extensions!
        const identifier = ctx._button_data as string
        const userId = String(ctx.from)

        if (!identifier) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>No customer identifier found.</b>',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        // Check user role - workers see percentages only
        const userRoles = await roleService.getUserRoles(userId)
        const isWorker = userRoles.includes('worker') && !userRoles.includes('admin')

        logger.info(
            { from: ctx.from, identifier, isWorker },
            'Customer statistics requested'
        )

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(
            provider,
            ctx.from,
            '📊 Fetching statistics and generating chart...'
        )

        try {
            // Fetch statistics from ISP API
            const statsData = await ispService.getUserStatistics(identifier)

            if (!statsData || statsData.length === 0) {
                await LoadingIndicator.hide(provider, loadingMsg)

                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    `📊 <b>No Statistics Available</b>\n\n` +
                        `No bandwidth data found for <code>${html.escape(identifier)}</code>.\n\n` +
                        `<i>The user may be offline or have no recent activity.</i>`,
                    { parse_mode: 'HTML' }
                )
                return endFlow()
            }

            // Calculate statistics summary
            const stats = calculateStats(statsData)

            // Generate chart image - workers see percentages only
            const chartBuffer = await generateBandwidthChart(statsData, {
                title: `Bandwidth Usage - ${identifier}`,
                width: 800,
                height: 400,
                percentageMode: isWorker,
            })

            await LoadingIndicator.hide(provider, loadingMsg)

            // Send chart image with caption - workers see percentages only
            const caption = formatStatsMessage(stats, identifier, isWorker)

            // Use InputFile for buffer - Telegram expects specific format
            await provider.vendor.telegram.sendPhoto(
                ctx.from,
                { source: chartBuffer },
                {
                    caption,
                    parse_mode: 'HTML',
                }
            )

            logger.info(
                { from: ctx.from, identifier, dataPoints: statsData.length },
                'Customer statistics chart sent successfully'
            )
        } catch (error) {
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error({ err: error, from: ctx.from, identifier }, 'Customer statistics failed')

            let errorMessage = '❌ <b>Statistics Failed</b>\n\n'

            if (error instanceof Error) {
                if (error.message.includes('not found') || error.message.includes('NOT_FOUND')) {
                    errorMessage += `Customer <code>${html.escape(identifier)}</code> not found.\n\n`
                    errorMessage += '<i>Please verify the phone number or username.</i>'
                } else if (error.message.includes('QuickChart')) {
                    errorMessage += `Failed to generate chart.\n\n`
                    errorMessage += '<i>Please try again later.</i>'
                } else {
                    errorMessage += `An error occurred while fetching statistics.\n\n`
                    errorMessage += `<i>Error: ${html.escape(error.message)}</i>`
                }
            } else {
                errorMessage += 'An unknown error occurred. Please try again.'
            }

            await provider.vendor.telegram.sendMessage(ctx.from, errorMessage, {
                parse_mode: 'HTML',
            })
        }

        return endFlow()
    })
