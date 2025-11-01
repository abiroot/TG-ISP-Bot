/**
 * Webhook Location Request Flow
 *
 * Triggered by webhook when a worker collects payment from a customer.
 * Prompts the worker to share the customer's current location.
 *
 * Flow:
 * 1. Worker clicks "Update Location" button from webhook message
 * 2. Client username is pre-filled from button data
 * 3. Worker selects location method (share or manual entry)
 * 4. Worker provides coordinates
 * 5. Location is updated for the pre-filled customer
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { validateIspUsername } from '~/core/utils/validators'
import { html } from '~/core/utils/telegramFormatting'

const logger = createFlowLogger('webhook-location-request-flow')

/**
 * Handle webhook location request button click
 * Button format: webhook_loc_req:{client_username}
 */
export const webhookLocationRequestFlow = addKeyword<TelegramProvider, Database>('BUTTON_WEBHOOK_LOC_REQ')
    .addAction(async (ctx, { state, extensions, provider, flowDynamic, endFlow }) => {
        const clientUsername = ctx._button_data as string

        logger.info({ from: ctx.from, clientUsername }, 'Webhook location request started')

        // Validate client username from button data
        if (!clientUsername || !validateIspUsername(clientUsername)) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Invalid customer username.</b>\n\nPlease use /setlocation to manually update location.',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        // Check if user is whitelisted or admin
        const { userManagementService } = extensions!
        const isAdmin = userManagementService.isAdmin(ctx.from)
        const isWhitelisted = await userManagementService.isWhitelisted(ctx.from)

        if (!isAdmin && !isWhitelisted) {
            await flowDynamic('⚠️ This feature is only available to whitelisted users.')
            return endFlow()
        }

        // Store client username and webhook trigger flag in state
        await state.update({
            clientUsername,
            triggeredBy: 'webhook',
            userMode: 'single', // Always single user for webhook
        })

        // Show location method selection
        await sendWithInlineButtons(
            ctx,
            { extensions, provider, state, flowDynamic } as any,
            `<b>📍 Update Location for Customer</b>\n\n` +
                `<b>Customer:</b> <code>${html.escape(clientUsername)}</code>\n\n` +
                `How would you like to provide the coordinates?`,
            [
                [createCallbackButton('📍 Share Location', 'webhook_loc_method:location')],
                [createCallbackButton('⌨️ Enter Manually', 'webhook_loc_method:manual')],
                [createCallbackButton('❌ Cancel', 'webhook_loc_method:cancel')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Handle webhook skip button click
 */
export const webhookLocationSkipFlow = addKeyword<TelegramProvider, Database>('BUTTON_WEBHOOK_LOC_SKIP')
    .addAction(async (ctx, { provider, endFlow }) => {
        await provider.vendor.telegram.sendMessage(
            ctx.from,
            '⏭️ <b>Location update skipped.</b>\n\nYou can update it later with /setlocation',
            { parse_mode: 'HTML' }
        )
        return endFlow()
    })

/**
 * Handle location method selection from webhook flow
 * Redirects to existing location flows with pre-filled customer username
 */
export const webhookLocationMethodFlow = addKeyword<TelegramProvider, Database>('BUTTON_WEBHOOK_LOC_METHOD')
    .addAction(async (ctx, { state, extensions, provider, flowDynamic, gotoFlow, endFlow }) => {
        const method = ctx._button_data as string

        // Handle cancellation
        if (method === 'cancel') {
            await state.clear()
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Operation cancelled.</b>',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        // Import existing location flows
        const { locationMethodLocationFlow } = await import('~/features/location/flows/UpdateCoordinatesFlow')
        const { locationHandlerFlow } = await import('~/features/location/flows/LocationHandlerFlow')

        // Dispatch to appropriate flow based on method
        if (method === 'location') {
            // User chose to share location
            await state.update({
                inputMethod: 'location',
                awaitingInput: 'coordinates',
            })

            // Show reply keyboard with location button (same as locationMethodLocationFlow)
            const { sendWithReplyButtons } = await import('~/core/utils/flowHelpers')
            const { createLocationButton, createTextButton } = await import('~/core/utils/telegramButtons')

            await sendWithReplyButtons(
                ctx,
                { extensions, provider, state, flowDynamic } as any,
                '📍 <b>Share Your Location</b>\n\n' +
                    'Tap the button below to share the customer\'s current location, or use the Telegram attachment menu.',
                [[createLocationButton('📍 Share Location')], [createTextButton('❌ Cancel')]],
                { oneTime: true, resize: true, parseMode: 'HTML' }
            )

            // Location will be handled by locationHandlerFlow (EVENTS.LOCATION)
            // After location is received, it will prompt for username
            // We need to override username prompt to auto-fill from webhook
        } else if (method === 'manual') {
            // User chose manual entry - delegate to existing flow
            await state.update({
                inputMethod: 'manual',
                awaitingInput: 'coordinates',
            })

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '⌨️ <b>Enter Coordinates</b>\n\n' +
                    'Please enter the coordinates in this format:\n' +
                    '<code>latitude, longitude</code>\n\n' +
                    '<b>Example:</b> <code>33.8547, 35.8623</code>\n\n' +
                    'Or type <b>cancel</b> to abort.',
                { parse_mode: 'HTML' }
            )

            // Coordinate capture will be handled by locationMethodLocationFlow's .addAnswer() chain
            // After coordinates are captured, it will prompt for username selection
            // We need to skip username prompt and go directly to confirmation
        }
    })
