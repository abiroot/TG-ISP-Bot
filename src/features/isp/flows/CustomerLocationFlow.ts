/**
 * Customer Location Flow
 *
 * Handles the location button click from the customer action menu.
 * Fetches the latest customer location from ISP API and returns a Google Maps link.
 *
 * Access: Admin and Worker roles only
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'

const logger = createFlowLogger('customer-location')

/**
 * Handle location button click
 * Button format: customer_location:{identifier}
 *
 * Always fetches fresh data from ISP API (no caching)
 */
export const customerLocationFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_LOCATION')
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

        logger.info({ from: ctx.from, identifier }, 'Customer location lookup initiated')

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '📍 Fetching location from ISP...')

        try {
            // Fetch fresh customer data from ISP API (includes latest location)
            const users = await ispService.searchCustomer(identifier)

            if (!users || users.length === 0) {
                await LoadingIndicator.hide(provider, loadingMsg)
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Customer not found</b>\n\n' +
                        `No customer found with identifier: <code>${html.escape(identifier)}</code>`,
                    { parse_mode: 'HTML' }
                )
                return endFlow()
            }

            // Get the first user (usually there's only one match)
            const user = users[0]
            const username = user.userName

            await LoadingIndicator.hide(provider, loadingMsg)

            // Check if location data exists in API response
            if (!user.latitude || !user.longitude) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '📍 <b>Location Not Found</b>\n\n' +
                        `No location has been recorded for customer <code>${html.escape(username)}</code>.\n\n` +
                        '<i>Location is only available after a collector has visited and shared their location.</i>',
                    { parse_mode: 'HTML' }
                )
                return endFlow()
            }

            // Build Google Maps link
            const mapsUrl = `https://www.google.com/maps?q=${user.latitude},${user.longitude}`

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                `📍 <b>Customer Location</b>\n\n` +
                    `<b>Customer:</b> <code>${html.escape(username)}</code>\n` +
                    `<b>Coordinates:</b> <code>${user.latitude}, ${user.longitude}</code>\n\n` +
                    `🗺️ <a href="${mapsUrl}">Open in Google Maps</a>`,
                {
                    parse_mode: 'HTML',
                    // Enable link preview to show map thumbnail
                    disable_web_page_preview: false,
                }
            )

            logger.info(
                { from: ctx.from, identifier, username, latitude: user.latitude, longitude: user.longitude },
                'Customer location lookup completed'
            )
        } catch (error) {
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error({ err: error, from: ctx.from, identifier }, 'Customer location lookup failed')

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Lookup failed</b>\n\n' +
                    'An error occurred while looking up the location. Please try again.',
                { parse_mode: 'HTML' }
            )
        }

        return endFlow()
    })
