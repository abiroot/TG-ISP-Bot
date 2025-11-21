/**
 * Customer Action Menu Flow
 *
 * Shows menu when a phone number or username is detected, allowing user to:
 * - Search for customer info
 * - Create a task for the customer
 * - Cancel
 *
 * Access: Admin and Worker roles only
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'

const logger = createFlowLogger('customer-action-menu')

/**
 * Handle search customer button click
 * Button format: customer_search:{identifier}
 */
export const customerSearchFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_SEARCH')
    .addAction(async (ctx, { extensions, provider, endFlow }) => {
        const { ispService } = extensions!
        const userId = String(ctx.from) // Normalize to string for consistent type handling
        const identifier = ctx._button_data as string

        if (!identifier) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>No customer identifier found.</b>',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        logger.info({ from: ctx.from, identifier }, 'Customer search initiated')

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '🔍 Searching...')

        try {
            // Search for customer
            const users = await ispService.searchCustomer(identifier)

            if (!users || users.length === 0) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Customer not found</b>\n\n' +
                        `No customer found with identifier: <code>${html.escape(identifier)}</code>`,
                    { parse_mode: 'HTML' }
                )

                // Hide loading indicator after sending "not found" message
                await LoadingIndicator.hide(provider, loadingMsg)
            } else {
                // Get user's role for formatting
                const { roleService } = extensions!
                const userRoles = await roleService.getUserRoles(userId)
                const primaryRole = userRoles.includes('admin') ? 'admin' : 'worker'

                // Format and send results (handle array of users)
                // formatUserInfo returns string[] for each user, so we need to flatten
                // Pass provider and loadingMsg for AP user progress updates
                const allUserMessages = await Promise.all(
                    users.map((user) => ispService.formatUserInfo(user, primaryRole, provider, loadingMsg))
                )
                const formattedMessages = allUserMessages.flat()

                for (const message of formattedMessages) {
                    await provider.vendor.telegram.sendMessage(ctx.from, message, {
                        parse_mode: 'HTML',
                    })
                }

                // Hide loading indicator after all results are sent
                await LoadingIndicator.hide(provider, loadingMsg)

                logger.info(
                    { from: ctx.from, identifier, resultCount: users.length },
                    'Customer search completed'
                )
            }
        } catch (error) {
            // Hide loading indicator before showing error message
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error({ err: error, from: ctx.from, identifier }, 'Customer search failed')

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Search failed</b>\n\n' +
                    'An error occurred while searching. Please try again.',
                { parse_mode: 'HTML' }
            )
        }

        return endFlow()
    })

/**
 * Handle cancel button click
 */
export const customerCancelFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_CANCEL')
    .addAction(async (ctx, { provider, endFlow }) => {
        await provider.vendor.telegram.sendMessage(
            ctx.from,
            '❌ <b>Cancelled</b>',
            { parse_mode: 'HTML' }
        )

        logger.info({ from: ctx.from }, 'Customer action cancelled')

        return endFlow()
    })
