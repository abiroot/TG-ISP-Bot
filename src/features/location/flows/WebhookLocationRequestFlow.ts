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
    .addAction(async (ctx, { state, globalState, extensions, provider, flowDynamic, endFlow }) => {
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
        const isAdmin = await userManagementService.isAdmin(ctx.from)
        const isWhitelisted = await userManagementService.isWhitelisted(ctx.from)

        if (!isAdmin && !isWhitelisted) {
            await flowDynamic('⚠️ This feature is only available to whitelisted users.')
            return endFlow()
        }

        // Store client username and webhook trigger flag in state AND globalState
        // GlobalState persists across flow transitions (needed for EVENTS.LOCATION)
        await state.update({
            clientUsername,
            triggeredBy: 'webhook',
            userMode: 'single', // Always single user for webhook
        })

        // Also store in globalState with user-specific key to persist across flows
        await globalState.update({
            [`webhook_${ctx.from}`]: {
                clientUsername,
                triggeredBy: 'webhook',
                timestamp: Date.now(),
            },
        })

        logger.debug({ userId: ctx.from, clientUsername }, 'Stored webhook context in globalState')

        // Show location sharing request (no reply keyboard - cleaner UX)
        await provider.vendor.telegram.sendMessage(
            ctx.from,
            `<b>📍 Update Location for Customer</b>\n\n` +
                `<b>Customer:</b> <code>${html.escape(clientUsername)}</code>\n\n` +
                `Please share the customer's current location:\n` +
                `• Tap the attachment icon (📎) and select "Location"\n` +
                `• Or send a Google Maps link\n`,
            { parse_mode: 'HTML' }
        )
    })

/**
 * Handle webhook skip button click
 */
export const webhookLocationSkipFlow = addKeyword<TelegramProvider, Database>('BUTTON_WEBHOOK_LOC_SKIP')
    .addAction(async (ctx, { provider, endFlow }) => {
        await provider.vendor.telegram.sendMessage(
            ctx.from,
            '⏭️ <b>Location update skipped.',
            { parse_mode: 'HTML' }
        )
        return endFlow()
    })

/**
 * Handle "Cancel" text during webhook location sharing
 * Uses specific button text to avoid conflicts with other flows
 */
export const webhookLocationCancelFlow = addKeyword<TelegramProvider, Database>(['❌ Cancel'])
    .addAction(async (ctx, { state, provider, endFlow }) => {
        // Only handle if we're in a webhook flow
        const triggeredBy = await state.get<string>('triggeredBy')
        const clientUsername = await state.get<string>('clientUsername')

        if (triggeredBy === 'webhook' && clientUsername) {
            await state.clear()
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Location update cancelled.</b>',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }
    })

