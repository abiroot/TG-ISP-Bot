import { addKeyword, EVENTS } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { runAdminMiddleware } from '~/core/middleware/adminMiddleware'
import { messageRepository } from '~/database/repositories/messageRepository'
import { splitLongMessage } from '~/utils/telegramMessageSplitter'

const unfulfilledLogger = createFlowLogger('UnfulfilledLocationsFlow')

/**
 * Unfulfilled Locations Flow - Admin Command
 * Lists location update webhook requests from the last 7 days that were never fulfilled
 *
 * Shows webhooks where:
 * - Worker received notification (logged in messages table)
 * - But no location record exists in customer_locations table
 *
 * Command: /unfulfilled
 */
export const unfulfilledLocationsFlow = addKeyword<TelegramProvider, Database>([
    '/unfulfilled',
]).addAction(async (ctx, utils) => {
    const { flowDynamic } = utils

    // Admin check (centralized middleware)
    const adminCheck = await runAdminMiddleware(ctx, utils)
    if (!adminCheck.allowed) return

    unfulfilledLogger.info({ from: ctx.from }, 'Unfulfilled locations command received')

    try {
        // Fetch unfulfilled location requests from last 7 days
        const unfulfilledRequests = await messageRepository.getUnfulfilledLocationRequests(7)

        // Build header
        let headerMessage = '<b>📍 Unfulfilled Location Requests</b>\n\n'
        headerMessage += '<i>Showing webhook requests from last 7 days with no location record</i>\n\n'
        headerMessage += `<b>Total Pending:</b> ${unfulfilledRequests.length}\n\n`

        // Build footer
        const footerMessage = '\n<b>Related Commands:</b>\n'
            + '• <code>/users</code> - List all telegram users\n'
            + '• <code>/list whitelist</code> - Show access control\n'
            + '• <code>/bot status</code> - Check bot status'

        if (unfulfilledRequests.length === 0) {
            // No unfulfilled requests - single message
            const emptyMessage = headerMessage
                + '✅ No unfulfilled location requests in the last 7 days!\n\n'
                + '<i>All webhook notifications have been processed.</i>'
                + footerMessage

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, emptyMessage, { parse_mode: 'HTML' })
        } else {
            // Build request entries
            let requestsContent = ''

            for (const request of unfulfilledRequests) {
                // ISP customer username (bold header)
                requestsContent += `• <b>${html.escape(request.client_username)}</b>\n`

                // Worker information
                const workerName = [request.worker_first_name, request.worker_last_name]
                    .filter(Boolean)
                    .join(' ')
                if (workerName) {
                    requestsContent += `  └ Worker: ${html.escape(workerName)}`
                    if (request.worker_telegram_handle) {
                        requestsContent += ` (@${html.escape(request.worker_telegram_handle)})`
                    }
                    requestsContent += '\n'
                } else if (request.worker_telegram_handle) {
                    requestsContent += `  └ Worker: @${html.escape(request.worker_telegram_handle)}\n`
                }

                // Resolved Telegram ID from telegram_user_mapping (what was looked up)
                requestsContent += `  └ Telegram ID (resolved): <code>${html.escape(request.worker_telegram_id)}</code>\n`

                // Webhook data (what was sent in the webhook request)
                requestsContent += `  └ <i>Webhook Data:</i>\n`
                if (request.webhook_worker_username) {
                    requestsContent += `    └ Worker Username: ${html.escape(request.webhook_worker_username)}\n`
                }
                if (request.webhook_tg_username) {
                    requestsContent += `    └ TG Username: ${html.escape(request.webhook_tg_username)}\n`
                }

                // Worker username from telegram_user_mapping (if available)
                if (request.worker_username) {
                    requestsContent += `  └ Billing System Username: ${html.escape(request.worker_username)}\n`
                }

                // Webhook timestamp
                const webhookTime = new Date(request.webhook_sent_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                })
                requestsContent += `  └ Requested: ${webhookTime}\n`

                // Time elapsed since webhook
                const now = new Date()
                const webhookDate = new Date(request.webhook_sent_at)
                const elapsedMs = now.getTime() - webhookDate.getTime()
                const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60))
                const elapsedMinutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60))

                if (elapsedHours > 0) {
                    requestsContent += `  └ Elapsed: ${elapsedHours}h ${elapsedMinutes}m ago\n`
                } else {
                    requestsContent += `  └ Elapsed: ${elapsedMinutes}m ago\n`
                }

                // Status badge
                requestsContent += `  └ Status: ⚠️ Never updated\n`

                requestsContent += '\n'
            }

            // Combine header + requests + footer
            const fullMessage = headerMessage + requestsContent + footerMessage

            // Split message if it exceeds Telegram's limit
            const messageChunks = splitLongMessage(fullMessage, 3900) // Use 3900 to leave room for formatting

            // Send all chunks sequentially
            const provider = utils.provider as TelegramProvider
            for (let i = 0; i < messageChunks.length; i++) {
                const chunk = messageChunks[i]

                // Add page indicator if multiple messages
                const pageIndicator = messageChunks.length > 1
                    ? `\n\n<i>Page ${i + 1}/${messageChunks.length}</i>`
                    : ''

                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    chunk + pageIndicator,
                    { parse_mode: 'HTML' }
                )
            }
        }

        unfulfilledLogger.info(
            { from: ctx.from, unfulfilledCount: unfulfilledRequests.length },
            'Unfulfilled locations list sent successfully'
        )
    } catch (error) {
        unfulfilledLogger.error({ err: error, from: ctx.from }, 'Failed to retrieve unfulfilled locations')
        await flowDynamic('❌ Failed to retrieve unfulfilled location requests. Please check the logs for details.')
    }
})
