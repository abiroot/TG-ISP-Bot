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

const logger = createFlowLogger('location-handler-flow')

/**
 * Direct location share handler
 */
export const locationHandlerFlow = addKeyword<TelegramProvider, Database>(EVENTS.LOCATION)
    .addAction(async (ctx, { state, globalState, extensions, provider, flowDynamic, endFlow }) => {
        const { userManagementService } = extensions!

        logger.info({ from: ctx.from }, 'Location message received')

        // Check whitelist or admin status
        const isAdmin = await userManagementService.isAdmin(ctx.from)
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
                    'Please try again',
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
            // Webhook flow: Update immediately with pre-filled username
            logger.info({ clientUsername, latitude, longitude }, 'Webhook location - updating immediately')

            const usernames = [clientUsername]

            // Get locationService from extensions
            const { locationService } = extensions!

            // Show loading indicator
            const loadingMsg = await provider.vendor.telegram.sendMessage(
                ctx.from,
                '🔄 <b>Updating location...</b>',
                { parse_mode: 'HTML' }
            )

            try {
                // Single user update (webhook always single user)
                const result = await locationService.updateCustomerLocation(
                    clientUsername,
                    latitude,
                    longitude,
                    ctx.from,
                    ctx.name || undefined
                )

                // Delete loading message
                await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)

                if (result.success) {
                    await provider.vendor.telegram.sendMessage(
                        ctx.from,
                        `✅ <b>Location Updated Successfully</b>\n\n` +
                            `<b>Customer:</b> ${html.escape(clientUsername)}\n` +
                            `<b>Coordinates:</b> <code>${latitude}, ${longitude}</code>\n\n` +
                            `${result.api_synced ? '✅' : '❌'} ISP API\n` +
                            `${result.local_saved ? '✅' : '❌'} Local database`,
                        { parse_mode: 'HTML' }
                    )
                } else {
                    await provider.vendor.telegram.sendMessage(
                        ctx.from,
                        `❌ <b>Update Failed</b>\n\n` +
                            `<b>Customer:</b> ${html.escape(clientUsername)}\n` +
                            `<b>Error:</b> ${html.escape(result.error || 'Unknown error')}`,
                        { parse_mode: 'HTML' }
                    )
                }

                logger.info({ username: clientUsername, latitude, longitude }, 'Webhook location update completed')
            } catch (error) {
                // Delete loading message on error
                try {
                    await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)
                } catch (e) {
                    // Ignore error if message already deleted
                }
                logger.error({ err: error }, 'Webhook location update failed')
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Update failed due to an unexpected error.</b>\n\nPlease try again later.',
                    { parse_mode: 'HTML' }
                )
            } finally {
                // Clear webhook state after update
                await state.update({
                    triggeredBy: null,
                    clientUsername: null,
                    userMode: null,
                })
                await state.clear()
            }

            return endFlow()
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
                        '• Start with a letter or digit\n' +
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

        // Get coordinates from state
        const latitude = await state.get<number>('latitude')
        const longitude = await state.get<number>('longitude')

        // Get locationService from extensions
        const { locationService } = extensions!

        // Show loading indicator
        const loadingMsg = await provider.vendor.telegram.sendMessage(
            ctx.from,
            '🔄 <b>Updating locations...</b>',
            { parse_mode: 'HTML' }
        )

        try {
            if (usernames.length === 1) {
                // Single user update
                const result = await locationService.updateCustomerLocation(
                    usernames[0],
                    latitude,
                    longitude,
                    ctx.from,
                    ctx.name || undefined
                )

                // Delete loading message
                await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)

                if (result.success) {
                    await provider.vendor.telegram.sendMessage(
                        ctx.from,
                        `✅ <b>Location Updated Successfully</b>\n\n` +
                            `<b>Customer:</b> ${html.escape(usernames[0])}\n` +
                            `<b>Coordinates:</b> <code>${latitude}, ${longitude}</code>\n\n` +
                            `${result.api_synced ? '✅' : '❌'} ISP API\n` +
                            `${result.local_saved ? '✅' : '❌'} Local database`,
                        { parse_mode: 'HTML' }
                    )
                } else {
                    await provider.vendor.telegram.sendMessage(
                        ctx.from,
                        `❌ <b>Update Failed</b>\n\n` +
                            `<b>Customer:</b> ${html.escape(usernames[0])}\n` +
                            `<b>Error:</b> ${html.escape(result.error || 'Unknown error')}`,
                        { parse_mode: 'HTML' }
                    )
                }
            } else {
                // Multiple users update
                const result = await locationService.updateMultipleCustomerLocations(
                    usernames,
                    latitude,
                    longitude,
                    ctx.from,
                    ctx.name || undefined
                )

                // Delete loading message
                await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)

                const successUsers = result.results.filter((r) => r.success)
                const failedUsers = result.results.filter((r) => !r.success)

                let message = `<b>📍 Batch Update Complete</b>\n\n`
                message += `<b>Summary:</b>\n`
                message += `✅ Success: ${result.successful}/${result.total}\n`
                message += `❌ Failed: ${result.failed}/${result.total}\n\n`

                if (successUsers.length > 0) {
                    message += `<b>✅ Updated Successfully:</b>\n`
                    message += successUsers.map((r) => `• ${html.escape(r.username)}`).join('\n')
                    message += '\n\n'
                }

                if (failedUsers.length > 0) {
                    message += `<b>❌ Failed:</b>\n`
                    message += failedUsers
                        .map((r) => `• ${html.escape(r.username)}: ${html.escape(r.error || 'Unknown error')}`)
                        .join('\n')
                }

                await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
            }

            logger.info({ usernames, latitude, longitude }, 'Location update completed')
        } catch (error) {
            // Delete loading message on error
            try {
                await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)
            } catch (e) {
                // Ignore error if message already deleted
            }
            logger.error({ err: error }, 'Location update failed')
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Update failed due to an unexpected error.</b>\n\nPlease try again later.',
                { parse_mode: 'HTML' }
            )
        } finally {
            await clearIdleTimer(ctx.from)
            await state.clear()
        }

        return endFlow()
    })
