/**
 * Location Handler Flow
 *
 * Handles native Telegram location messages sent directly by users.
 * Extracts coordinates and prompts for username(s) to update.
 *
 * This flow is triggered when:
 * - User shares location via Telegram's location feature
 * - User shares location from the reply keyboard location button
 *
 * Telegram location message structure:
 * ctx.message.location = { latitude: number, longitude: number }
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { startIdleTimer, clearIdleTimer, TIMEOUT_PRESETS } from '~/core/utils/flowTimeout'
import { html } from '~/core/utils/telegramFormatting'
import { validateIspUsername, parseUsernameList } from '~/core/utils/validators'
import { storeConfirmationData } from '~/core/utils/buttonStateStore'

const logger = createFlowLogger('location-handler-flow')

/**
 * Direct location share handler
 */
export const locationHandlerFlow = addKeyword<TelegramProvider, Database>(EVENTS.LOCATION)
    .addAction(async (ctx, { state, globalState, extensions, provider, flowDynamic, endFlow }) => {
        const { userManagementService } = extensions!

        logger.info({ from: ctx.from }, 'Location message received')

        // Check whitelist or admin status
        const isAdmin = userManagementService.isAdmin(ctx.from)
        const isWhitelisted = await userManagementService.isWhitelisted(ctx.from)

        if (!isAdmin && !isWhitelisted) {
            await flowDynamic('⚠️ This feature is only available to whitelisted users.')
            return endFlow()
        }

        // Extract coordinates from Telegram location message
        // BuilderBot stores Telegram update in ctx.messageCtx.update

        // Debug: Log the structure
        const telegramUpdate = ctx.messageCtx?.update
        const telegramMessage = telegramUpdate?.message

        logger.info({
            hasUpdate: !!telegramUpdate,
            updateKeys: telegramUpdate ? Object.keys(telegramUpdate) : [],
            hasMessage: !!telegramMessage,
            messageKeys: telegramMessage ? Object.keys(telegramMessage) : [],
            hasLocation: !!telegramMessage?.location,
        }, 'Location context debug')

        // Extract location from Telegram update
        let location = telegramMessage?.location || null

        // Fallback checks for other possible structures
        if (!location) {
            location = ctx.messageCtx?.location || ctx.message?.location || ctx.location || null
        }

        // Last resort: check if coordinates are directly on ctx
        if (!location && typeof ctx.latitude === 'number' && typeof ctx.longitude === 'number') {
            location = { latitude: ctx.latitude, longitude: ctx.longitude }
        }

        if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
            logger.error({
                hasLocation: !!location,
                locationKeys: location ? Object.keys(location) : [],
                messageCtxKeys: telegramMessage ? Object.keys(telegramMessage) : [],
            }, 'Invalid location data - could not find coordinates')
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Failed to extract location coordinates.</b>\n\n' +
                    'Please try again or use manual coordinate entry with /setlocation',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        const { latitude, longitude } = location

        // Validate coordinate ranges (should always be valid from Telegram, but safety check)
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            logger.warn({ latitude, longitude }, 'Coordinates out of valid range')
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Invalid coordinates received.</b>\n\n' +
                    'Latitude must be between -90 and 90.\n' +
                    'Longitude must be between -180 and 180.',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        logger.info({ latitude, longitude }, 'Valid coordinates extracted')

        // Store coordinates in state
        await state.update({
            latitude,
            longitude,
        })

        // Check if this is a webhook-triggered flow
        // First try state, then globalState (which persists across flows)
        let triggeredBy = await state.get<string>('triggeredBy')
        let clientUsername = await state.get<string>('clientUsername')

        // If not in state, check globalState
        if (!triggeredBy || !clientUsername) {
            const webhookData = await globalState.get<{ clientUsername: string; triggeredBy: string; timestamp: number }>(
                `webhook_${ctx.from}`
            )
            if (webhookData) {
                triggeredBy = webhookData.triggeredBy
                clientUsername = webhookData.clientUsername
                // Also update local state for consistency
                await state.update({ triggeredBy, clientUsername, userMode: 'single' })
                logger.debug({ webhookData }, 'Retrieved webhook context from globalState')
            }
        }

        logger.debug({ triggeredBy, clientUsername, from: ctx.from }, 'Checking webhook context')

        if (triggeredBy === 'webhook' && clientUsername) {
            // Clear globalState for this user after retrieving
            await globalState.update({ [`webhook_${ctx.from}`]: null })
            // Webhook flow: Skip user mode selection, go directly to confirmation
            logger.info({ clientUsername, latitude, longitude }, 'Webhook location - auto-filling username')

            const usernames = [clientUsername]
            await state.update({ usernames })

            const summary =
                `<b>📍 Update Summary</b>\n\n` +
                `<b>Coordinates:</b>\n` +
                `📍 <code>${latitude}, ${longitude}</code>\n\n` +
                `<b>Customer:</b>\n` +
                `• ${html.escape(clientUsername)}\n\n` +
                `⚡ Location will be updated in ISP system and local database.`

            // Encode state data (use store if too large)
            const encodedData = `yes|lat:${latitude}|lon:${longitude}|u:${usernames.join(',')}`
            let confirmCallbackData: string

            if (encodedData.length > 55) {
                const stateId = storeConfirmationData(ctx.from, latitude, longitude, usernames)
                confirmCallbackData = `loc_confirm:ref:${stateId}`
                logger.debug({ stateId }, 'Using state store for webhook confirmation')
            } else {
                confirmCallbackData = `loc_confirm:${encodedData}`
            }

            await sendWithInlineButtons(
                ctx,
                { extensions, provider, state, flowDynamic } as any,
                summary,
                [
                    [createCallbackButton('✅ Confirm Update', confirmCallbackData)],
                    [createCallbackButton('❌ Cancel', 'loc_confirm:no')],
                ],
                { parseMode: 'HTML' }
            )

            // Clear webhook state after showing confirmation to prevent state persistence
            await state.update({
                triggeredBy: null,
                clientUsername: null,
                userMode: null,
            })

            logger.debug({ from: ctx.from }, 'Cleared webhook state after confirmation display')
        } else {
            // Normal flow: Prompt for user mode selection
            await sendWithInlineButtons(
                ctx,
                { extensions, provider, state, flowDynamic } as any,
                `✅ <b>Location Received</b>\n\n` +
                    `📍 <code>${latitude.toFixed(6)}, ${longitude.toFixed(6)}</code>\n\n` +
                    `Update for single or multiple customers?`,
                [
                    [createCallbackButton('👤 Single User', 'loc_direct_mode:single')],
                    [createCallbackButton('👥 Multiple Users', 'loc_direct_mode:multiple')],
                ],
                { parseMode: 'HTML' }
            )
        }
    })

/**
 * User mode selection for direct location sharing with inline username capture
 */
export const locationDirectUserModeFlow = addKeyword<TelegramProvider, Database>('BUTTON_LOC_DIRECT_MODE')
    .addAction(async (ctx, { state, provider }) => {
        const mode = ctx._button_data as 'single' | 'multiple'

        await state.update({
            userMode: mode,
        })

        logger.info({ userMode: mode }, 'Direct location - user mode selected')

        // Start timeout (2 minutes)
        await startIdleTimer(ctx, state, TIMEOUT_PRESETS.QUERY, async () => {
            await state.clear()
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '⏰ <b>Timeout</b>\n\nPlease share a location again to restart.',
                { parse_mode: 'HTML' }
            )
        })

        if (mode === 'single') {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '👤 <b>Single User Update</b>\n\n' +
                    'Enter the ISP username:\n' +
                    '<b>Example:</b> <code>josianeyoussef</code>\n\n' +
                    'Or type <b>cancel</b> to abort.',
                { parse_mode: 'HTML' }
            )
        } else {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '👥 <b>Multiple Users Update</b>\n\n' +
                    'Enter usernames separated by commas:\n' +
                    '<b>Example:</b> <code>josianeyoussef, john_doe, alice123</code>\n\n' +
                    'Or type <b>cancel</b> to abort.',
                { parse_mode: 'HTML' }
            )
        }
    })
    .addAnswer('', { capture: true }, async (ctx, { state, extensions, provider, flowDynamic, fallBack, endFlow }) => {
        const input = ctx.body.trim()

        logger.debug({ input, from: ctx.from }, 'Username capture - received input')

        // Check for cancellation
        if (input.toLowerCase() === 'cancel') {
            await clearIdleTimer(ctx.from)
            await state.clear()
            await provider.vendor.telegram.sendMessage(ctx.from, '❌ <b>Operation cancelled.</b>', { parse_mode: 'HTML' })
            return endFlow()
        }

        // Clear timeout since user provided valid input
        await clearIdleTimer(ctx.from)

        const userMode = await state.get<string>('userMode')
        let usernames: string[]

        if (userMode === 'single') {
            // Single username validation
            if (!validateIspUsername(input)) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Invalid username format.</b>\n\n' +
                        'Username must:\n' +
                        '• Start with a letter\n' +
                        '• Be 3-32 characters\n' +
                        '• Contain only letters, numbers, underscore, or dot\n\n' +
                        'Please try again or type <b>cancel</b>.',
                    { parse_mode: 'HTML' }
                )
                return fallBack()
            }
            usernames = [input]
        } else {
            // Multiple usernames
            usernames = parseUsernameList(input)

            if (usernames.length === 0) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>No valid usernames found.</b>\n\n' +
                        'Please enter usernames separated by commas.',
                    { parse_mode: 'HTML' }
                )
                return fallBack()
            }

            // Validate format
            const invalidFormat = usernames.filter((u) => !validateIspUsername(u))
            if (invalidFormat.length > 0) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Invalid username format:</b>\n' +
                        invalidFormat.map((u) => `• ${html.escape(u)}`).join('\n') +
                        '\n\nPlease check the format and try again.',
                    { parse_mode: 'HTML' }
                )
                return fallBack()
            }
        }

        // Store usernames
        await state.update({
            usernames,
        })

        logger.info({ usernames }, 'Usernames captured successfully')

        // Show confirmation
        const latitude = await state.get<number>('latitude')
        const longitude = await state.get<number>('longitude')

        const summary =
            `<b>📍 Update Summary</b>\n\n` +
            `<b>Coordinates:</b>\n` +
            `📍 <code>${latitude}, ${longitude}</code>\n\n` +
            `<b>Customer(s):</b>\n` +
            usernames.map((u) => `• ${html.escape(u)}`).join('\n') +
            `\n\n<b>Total:</b> ${usernames.length} customer(s)\n\n` +
            `⚡ Locations will be updated in ISP system and local database.\n` +
            `Invalid usernames will be reported after attempting update.`

        // Encode state data in button callback for reliability
        // If data is too large (>64 bytes), use temporary store
        const encodedData = `yes|lat:${latitude}|lon:${longitude}|u:${usernames.join(',')}`

        let confirmCallbackData: string
        if (encodedData.length > 55) { // Leave room for "loc_confirm:" prefix
            // Store in temporary memory store and use short reference
            const stateId = storeConfirmationData(ctx.from, latitude, longitude, usernames)
            confirmCallbackData = `loc_confirm:ref:${stateId}`
            logger.debug({ stateId, dataLength: encodedData.length }, 'Using state store for large data')
        } else {
            confirmCallbackData = `loc_confirm:${encodedData}`
        }

        await sendWithInlineButtons(
            ctx,
            { extensions, provider, state, flowDynamic } as any,
            summary,
            [
                [createCallbackButton('✅ Confirm Update', confirmCallbackData)],
                [createCallbackButton('❌ Cancel', 'loc_confirm:no')],
            ],
            { parseMode: 'HTML' }
        )
    })
