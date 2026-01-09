/**
 * Customer Ping Station Flow
 *
 * Shows network ping diagnostics for the customer's Station IP.
 * First fetches customer info to get the Station IP, then pings it.
 *
 * Access: Admin and Worker roles only
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'

const logger = createFlowLogger('customer-ping-station')

/**
 * Handle ping Station button click
 * Button format: customer_ping_station:{identifier}
 */
export const customerPingStationFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_PING_STATION')
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

        logger.info({ from: ctx.from, identifier }, 'Customer Station ping initiated')

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '🔍 Fetching customer info...')

        try {
            // First, fetch customer info to get the Station IP
            const customers = await ispService.searchCustomer(identifier)

            if (customers.length === 0) {
                await LoadingIndicator.hide(provider, loadingMsg)
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    `❌ <b>Customer Not Found</b>\n\n` +
                        `Customer <code>${html.escape(identifier)}</code> not found.\n\n` +
                        '<i>Please verify the phone number or username.</i>',
                    { parse_mode: 'HTML' }
                )
                return endFlow()
            }

            const customer = customers[0]
            const stationIp = customer.stationIpAddress

            if (!stationIp) {
                await LoadingIndicator.hide(provider, loadingMsg)
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    `❌ <b>No Station IP</b>\n\n` +
                        `Customer <code>${html.escape(customer.userName)}</code> does not have a Station IP assigned.\n\n` +
                        `<b>Station:</b> ${customer.stationName || 'N/A'}`,
                    { parse_mode: 'HTML' }
                )
                return endFlow()
            }

            // Update loading message
            if (loadingMsg) {
                try {
                    await provider.vendor.telegram.editMessageText(
                        loadingMsg.chat_id,
                        loadingMsg.message_id,
                        undefined,
                        `📡 Pinging Station ${stationIp}...`,
                        { parse_mode: 'HTML' }
                    )
                } catch {
                    // Ignore edit errors
                }
            }

            // Ping the Station IP
            const pingData = await ispService.pingIP(stationIp)

            await LoadingIndicator.hide(provider, loadingMsg)

            // Debug log to see response structure
            logger.info(
                { pingData, identifier, stationIp },
                '🔍 DEBUG: Ping Station API response'
            )

            // Format and display ping results
            let message = `📡 <b>Station Ping Results</b>\n\n`
            message += `<b>Customer:</b> <code>${html.escape(customer.userName)}</code>\n`
            message += `<b>Station:</b> ${html.escape(customer.stationName || 'N/A')}\n`
            message += `<b>Station IP:</b> <code>${html.escape(stationIp)}</code>\n`
            message += `<b>Station Status:</b> ${customer.stationOnline ? '🟢 Online' : '🔴 Offline'}\n\n`

            // Handle response format from /ping endpoint
            // Response: { reachable: boolean, exitCode: number, durationMs: number, output: string, error: string }
            if (pingData.output) {
                // Show reachability status
                const reachableStatus = pingData.reachable ? '✅ Reachable' : '❌ Unreachable'
                message += `<b>Status:</b> ${reachableStatus}\n`
                if (pingData.durationMs) {
                    message += `<b>Duration:</b> ${(pingData.durationMs / 1000).toFixed(1)}s\n\n`
                }
                message += `<pre>${html.escape(String(pingData.output))}</pre>`
            } else if (pingData.error) {
                message += `<b>❌ Error:</b>\n<pre>${html.escape(String(pingData.error))}</pre>`
            } else if (Array.isArray(pingData)) {
                const pingOutput = pingData
                    .map((line: string) => html.escape(line.trim()))
                    .filter((line: string) => line.length > 0)
                    .join('\n')
                message += `<pre>${pingOutput}</pre>`
            } else if (typeof pingData === 'string') {
                message += `<pre>${html.escape(pingData)}</pre>`
            } else {
                message += `<b>⚠️ Unknown response format (showing raw data):</b>\n\n`
                message += `<pre>${html.escape(JSON.stringify(pingData, null, 2))}</pre>`
            }

            await provider.vendor.telegram.sendMessage(ctx.from, message, {
                parse_mode: 'HTML',
            })

            logger.info({ from: ctx.from, identifier, stationIp }, 'Customer Station ping completed successfully')
        } catch (error) {
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error({ err: error, from: ctx.from, identifier }, 'Customer Station ping failed')

            let errorMessage = '❌ <b>Station Ping Failed</b>\n\n'

            if (error instanceof Error) {
                if (error.message.includes('not found') || error.message.includes('CUSTOMER_NOT_FOUND')) {
                    errorMessage += `Customer <code>${html.escape(identifier)}</code> not found.\n\n`
                    errorMessage += '<i>Please verify the phone number or username.</i>'
                } else {
                    errorMessage += `An error occurred while pinging the Station.\n\n`
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
