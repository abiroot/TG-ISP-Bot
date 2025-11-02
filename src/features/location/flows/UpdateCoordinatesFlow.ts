/**
 * Update Coordinates Flow
 *
 * Allows whitelisted users (money collectors) to update ISP customer locations.
 * Supports both text coordinates and native Telegram location sharing.
 *
 * Flow:
 * 1. Input method selection (manual or location button)
 * 2. Coordinate capture (text or location)
 * 3. User mode selection (single or multiple)
 * 4. Username capture
 * 5. Confirmation
 * 6. Execution (ISP API + local DB)
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createCallbackButton, createTextButton, createLocationButton } from '~/core/utils/telegramButtons'
import { sendWithInlineButtons, sendWithReplyButtons } from '~/core/utils/flowHelpers'
import { html } from '~/core/utils/telegramFormatting'
import {
    validateCoordinates,
    validateIspUsername,
    parseUsernameList,
} from '~/core/utils/validators'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'
import { createFlowLogger } from '~/core/utils/logger'
import { startIdleTimer, clearIdleTimer, TIMEOUT_PRESETS } from '~/core/utils/flowTimeout'

const logger = createFlowLogger('update-coordinates-flow')

/**
 * Main flow - Entry point
 */
export const updateCoordinatesFlow = addKeyword<TelegramProvider, Database>([
    '/setlocation',
    '/coordinates',
    'update location',
    'set coordinates',
])
    .addAction(async (ctx, { state, extensions, provider, flowDynamic }) => {
        const { userManagementService } = extensions!

        logger.info({ from: ctx.from }, 'Update coordinates flow started')

        // Check whitelist or admin status
        const isAdmin = await userManagementService.isAdmin(ctx.from)
        const isWhitelisted = await userManagementService.isWhitelisted(ctx.from)

        if (!isAdmin && !isWhitelisted) {
            await flowDynamic('⚠️ This feature is only available to whitelisted users.')
            return
        }

        // Clear any existing state
        await state.clear()

        // Step 1: Input method selection
        await sendWithInlineButtons(
            ctx,
            { extensions, provider, state, flowDynamic } as any,
            '<b>📍 Update Customer Location</b>\n\n' +
                'How would you like to provide the coordinates?',
            [
                [createCallbackButton('📍 Share Location', 'loc_method:location')],
                [createCallbackButton('⌨️ Enter Manually', 'loc_method:manual')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Location method selection handlers with inline coordinate capture
 */
export const locationMethodLocationFlow = addKeyword<TelegramProvider, Database>('BUTTON_LOC_METHOD')
    .addAction(async (ctx, { state, extensions, provider, flowDynamic }) => {
        const method = ctx._button_data as string

        if (method === 'location') {
            // User chose to share location
            await state.update({
                inputMethod: 'location',
                awaitingInput: 'coordinates',
            })

            // Show reply keyboard with location button
            await sendWithReplyButtons(
                ctx,
                { extensions, provider, state, flowDynamic } as any,
                '📍 <b>Share Your Location</b>\n\n' +
                    'Tap the button below to share your current location, or use the Telegram attachment menu to send a location.',
                [[createLocationButton('📍 Share Location')], [createTextButton('❌ Cancel')]],
                { oneTime: true, resize: true, parseMode: 'HTML' }
            )
            // Note: Location sharing is handled by locationHandlerFlow (EVENTS.LOCATION)
        } else if (method === 'manual') {
            // User chose manual entry
            await state.update({
                inputMethod: 'manual',
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
        }
    })
    .addAnswer('', { capture: true }, async (ctx, { state, extensions, provider, flowDynamic, fallBack, endFlow }) => {
        // Only process if manual coordinate entry mode
        const inputMethod = await state.get<string>('inputMethod')

        if (inputMethod !== 'manual') {
            // Skip capture for location button mode (handled by EVENTS.LOCATION)
            return
        }

        const input = ctx.body.trim()

        logger.debug({ input, from: ctx.from }, 'Manual coordinate capture - received input')

        // Check for cancellation
        if (input.toLowerCase() === 'cancel') {
            await state.clear()
            await provider.vendor.telegram.sendMessage(ctx.from, '❌ <b>Operation cancelled.</b>', { parse_mode: 'HTML' })
            return endFlow()
        }

        // Validate coordinates
        const validation = await validateCoordinates(input)
        if (!validation.valid) {
            await provider.vendor.telegram.sendMessage(ctx.from, `❌ ${html.escape(validation.error || 'Invalid coordinates')}`, {
                parse_mode: 'HTML',
            })
            return fallBack()
        }

        // Store coordinates
        await state.update({
            latitude: validation.latitude,
            longitude: validation.longitude,
        })

        logger.info(
            { latitude: validation.latitude, longitude: validation.longitude },
            'Manual coordinates captured successfully'
        )

        // Step 3: User mode selection
        await sendWithInlineButtons(
            ctx,
            { extensions, provider, state, flowDynamic } as any,
            `✅ <b>Coordinates Received</b>\n\n` +
                `📍 <code>${validation.latitude}, ${validation.longitude}</code>\n\n` +
                `Update for single or multiple customers?`,
            [
                [createCallbackButton('👤 Single User', 'loc_mode:single')],
                [createCallbackButton('👥 Multiple Users', 'loc_mode:multiple')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * User mode selection handlers with inline username capture
 */
export const locationUserModeFlow = addKeyword<TelegramProvider, Database>('BUTTON_LOC_MODE')
    .addAction(async (ctx, { state, provider }) => {
        const mode = ctx._button_data as 'single' | 'multiple'

        await state.update({
            userMode: mode,
        })

        logger.info({ userMode: mode }, 'User mode selected')

        // Start timeout (2 minutes)
        await startIdleTimer(ctx, state, TIMEOUT_PRESETS.QUERY, async () => {
            await state.clear()
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '⏰ <b>Timeout</b>\n\nPlease start over with /setlocation',
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

        // Get coordinates from state
        const latitude = await state.get<number>('latitude')
        const longitude = await state.get<number>('longitude')

        // Get locationService from extensions
        const { locationService } = extensions!

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(
            provider,
            ctx.from,
            '🔄 Updating locations...'
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

                await LoadingIndicator.hide(provider, loadingMsg)

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

                await LoadingIndicator.hide(provider, loadingMsg)

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
            await LoadingIndicator.hide(provider, loadingMsg)
            logger.error({ err: error }, 'Location update failed')
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Update failed due to an unexpected error.</b>\n\nPlease try again later.',
                { parse_mode: 'HTML' }
            )
        } finally {
            await state.clear()
        }

        return endFlow()
    })
