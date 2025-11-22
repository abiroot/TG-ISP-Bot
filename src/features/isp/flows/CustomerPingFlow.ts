/**
 * Customer Ping Flow
 *
 * Shows network ping diagnostics when user clicks "PING User" button.
 * Calls external ISP API /api/user-ping?mobile={identifier} endpoint.
 *
 * Access: Admin and Worker roles only
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'

const logger = createFlowLogger('customer-ping')

/**
 * Handle ping user button click
 * Button format: customer_ping:{identifier}
 */
export const customerPingFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_PING')
    .addAction(async (ctx, { extensions, provider, endFlow }) => {
        const { ispService } = extensions!
        const identifier = ctx._button_data as string

        if (!identifier) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>No customer identifier found.</b>',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        logger.info({ from: ctx.from, identifier }, 'Customer ping initiated')

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '📡 Pinging customer...')

        try {
            // Call ISP API to ping customer
            const pingData = await ispService.pingCustomer(identifier)

            await LoadingIndicator.hide(provider, loadingMsg)

            // Debug log to see response structure
            logger.info(
                { pingData, identifier },
                '🔍 DEBUG: Ping API response (check this to understand structure)'
            )

            // Format and display ping results
            // ISP API returns an array of strings directly: ["line1", "line2", ...]
            let message = `📡 <b>Ping Results</b>\n\n`
            message += `<b>Customer:</b> <code>${html.escape(identifier)}</code>\n\n`

            // Handle response format
            if (Array.isArray(pingData)) {
                // API returns array of strings directly
                const pingOutput = pingData
                    .map((line: string) => html.escape(line.trim()))
                    .filter((line: string) => line.length > 0) // Remove empty lines
                    .join('\n')
                message += `<pre>${pingOutput}</pre>`
            } else if (typeof pingData === 'string') {
                // Response is a plain string
                message += `<pre>${html.escape(pingData)}</pre>`
            } else if (pingData.result) {
                // Response has 'result' field
                message += `<pre>${html.escape(String(pingData.result))}</pre>`
            } else if (pingData.results && Array.isArray(pingData.results)) {
                // Response has 'results' array
                message += `<pre>${pingData.results.map((line: string) => html.escape(line)).join('\n')}</pre>`
            } else if (pingData.output) {
                // Response has 'output' field
                message += `<pre>${html.escape(String(pingData.output))}</pre>`
            } else if (pingData.data) {
                // Response has 'data' field
                message += `<pre>${html.escape(JSON.stringify(pingData.data, null, 2))}</pre>`
            } else {
                // Unknown format - show raw JSON for debugging
                message += `<b>⚠️ Unknown response format (showing raw data):</b>\n\n`
                message += `<pre>${html.escape(JSON.stringify(pingData, null, 2))}</pre>`
            }

            await provider.vendor.telegram.sendMessage(ctx.from, message, {
                parse_mode: 'HTML',
            })

            logger.info({ from: ctx.from, identifier }, 'Customer ping completed successfully')
        } catch (error) {
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error({ err: error, from: ctx.from, identifier }, 'Customer ping failed')

            let errorMessage = '❌ <b>Ping Failed</b>\n\n'

            if (error instanceof Error) {
                if (error.message.includes('not found') || error.message.includes('CUSTOMER_NOT_FOUND')) {
                    errorMessage += `Customer <code>${html.escape(identifier)}</code> not found.\n\n`
                    errorMessage += '<i>Please verify the phone number or username.</i>'
                } else {
                    errorMessage += `An error occurred while pinging the customer.\n\n`
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
