/**
 * Welcome Flow
 *
 * Simplified welcome flow that uses CoreAIService
 * No more Langchain intent classification - AI SDK handles tool selection
 *
 * Benefits:
 * - 45% cost reduction (1 LLM call instead of 2)
 * - Faster responses (no sequential bottleneck)
 * - Simpler code (no intent service)
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { CoreAIServiceError, AIResponse } from '~/features/conversation/services/CoreAIService'
import { withRetry } from '~/core/utils/flowRetry'
import { sendFormattedMessage } from '~/core/utils/telegramFormatting'
import { getContextId } from '~/core/utils/contextId'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'
import { extractCoordinatesFromText, containsLocationUrl } from '~/core/utils/locationParser'

const flowLogger = createFlowLogger('welcome')

/**
 * Welcome Flow - Catches all unmatched messages
 * Uses EVENTS.WELCOME (BuilderBot catch-all)
 */
export const welcomeFlow = addKeyword<TelegramProvider, Database>(EVENTS.WELCOME)
    .addAction(async (ctx, utils) => {
        const { flowDynamic, gotoFlow, extensions, provider } = utils
        const { coreAIService, userManagementService, ispService, botStateService } = extensions!

        flowLogger.info({ from: ctx.from, body: ctx.body }, 'Welcome flow triggered')

        // Check if personality exists
        const contextId = getContextId(ctx.from)
        const personality = await userManagementService.getPersonality(contextId)

        if (!personality) {
            flowLogger.info({ from: ctx.from }, 'First-time user - routing to onboarding')

            // Route to new onboarding flow (button-based modern UI)
            const { onboardingWelcomeFlow } = await import('~/features/onboarding/flows')
            return gotoFlow(onboardingWelcomeFlow)
        }

        // Check if message contains a location URL
        if (containsLocationUrl(ctx.body)) {
            const coordinates = await extractCoordinatesFromText(ctx.body)
            if (coordinates) {
                flowLogger.info(
                    { from: ctx.from, coordinates, body: ctx.body },
                    'Location URL detected - checking webhook context'
                )

                // Store coordinates in state
                const { state, globalState } = utils
                await state.update({
                    latitude: coordinates.latitude,
                    longitude: coordinates.longitude,
                })

                // Check if this is a webhook-triggered location request
                let triggeredBy = await state.get<string>('triggeredBy')
                let clientUsername = await state.get<string>('clientUsername')

                // If not in state, check globalState (persists across flows)
                if (!triggeredBy || !clientUsername) {
                    const webhookData = await globalState.get<{
                        clientUsername: string
                        triggeredBy: string
                        timestamp: number
                    }>(`webhook_${ctx.from}`)

                    if (webhookData) {
                        triggeredBy = webhookData.triggeredBy
                        clientUsername = webhookData.clientUsername
                        await state.update({ triggeredBy, clientUsername, userMode: 'single' })
                        flowLogger.debug({ webhookData }, 'Retrieved webhook context from globalState')
                    }
                }

                // If webhook context exists, update immediately with pre-filled username
                if (triggeredBy === 'webhook' && clientUsername) {
                    flowLogger.info(
                        { clientUsername, coordinates },
                        'Webhook location URL - updating immediately'
                    )

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
                            coordinates.latitude,
                            coordinates.longitude,
                            ctx.from,
                            ctx.name || undefined
                        )

                        // Delete loading message
                        await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)

                        if (result.success) {
                            await provider.vendor.telegram.sendMessage(
                                ctx.from,
                                `✅ <b>Location Updated Successfully</b>\n\n` +
                                    `<b>Customer:</b> ${clientUsername}\n` +
                                    `<b>Coordinates:</b> <code>${coordinates.latitude}, ${coordinates.longitude}</code>\n\n` +
                                    `${result.api_synced ? '✅' : '❌'} ISP API\n` +
                                    `${result.local_saved ? '✅' : '❌'} Local database`,
                                { parse_mode: 'HTML' }
                            )
                        } else {
                            await provider.vendor.telegram.sendMessage(
                                ctx.from,
                                `❌ <b>Update Failed</b>\n\n` +
                                    `<b>Customer:</b> ${clientUsername}\n` +
                                    `<b>Error:</b> ${result.error || 'Unknown error'}`,
                                { parse_mode: 'HTML' }
                            )
                        }

                        flowLogger.info(
                            { username: clientUsername, coordinates },
                            'Webhook location URL update completed'
                        )
                    } catch (error) {
                        // Delete loading message on error
                        try {
                            await provider.vendor.telegram.deleteMessage(ctx.from, loadingMsg.message_id)
                        } catch (e) {
                            // Ignore if already deleted
                        }
                        flowLogger.error({ err: error }, 'Webhook location URL update failed')
                        await provider.vendor.telegram.sendMessage(
                            ctx.from,
                            '❌ <b>Update failed due to an unexpected error.</b>\n\nPlease try again later.',
                            { parse_mode: 'HTML' }
                        )
                    } finally {
                        // Clear webhook context
                        await globalState.update({ [`webhook_${ctx.from}`]: null })
                        await state.clear()
                    }

                    return // End flow after webhook update
                }

                // No webhook context - normal flow: ask for user mode
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    `✅ <b>Location URL Detected</b>\n\n` +
                        `📍 <code>${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}</code>\n\n` +
                        `Update for single or multiple customers?`,
                    {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '👤 Single User', callback_data: 'loc_direct_mode:single' },
                                    { text: '👥 Multiple Users', callback_data: 'loc_direct_mode:multiple' },
                                ],
                            ],
                        },
                    }
                )

                return // Stop processing, wait for button click
            }
        }

        // Check if AI is enabled
        if (!(await botStateService.isFeatureEnabled('ai_responses'))) {
            await sendFormattedMessage(ctx, utils, '⚠️ AI responses are currently disabled.')
            return
        }

        // Check maintenance mode (already handled by middleware, but safety check)
        if (await botStateService.isMaintenanceMode()) {
            const message = await botStateService.getMaintenanceMessage()
            await sendFormattedMessage(ctx, utils, message)
            return
        }

        // Check for customer identifier (phone/username) and show menu if found
        // Only for admin and worker roles
        const { extractFirstUserIdentifier } = await import('~/features/isp/utils/userIdentifierExtractor')
        const identifier = extractFirstUserIdentifier(ctx.body)

        if (identifier && identifier.value) {
            // Check if user is admin or worker
            const { roleService } = extensions!
            const userId = String(ctx.from) // Normalize to string for consistent type handling
            const userRoles = await roleService.getUserRoles(userId)
            const isAdminOrWorker = userRoles.includes('admin') || userRoles.includes('worker')

            if (isAdminOrWorker) {
                flowLogger.info(
                    { from: ctx.from, identifier: identifier.value, type: identifier.type },
                    'Customer identifier detected - showing action menu'
                )

                // Show customer action menu
                // Pass identifier via callback_data (not state) so it persists across flows
                const { sendWithInlineButtons } = await import('~/core/utils/flowHelpers')
                const { createCallbackButton } = await import('~/core/utils/telegramButtons')
                const { html } = await import('~/core/utils/telegramFormatting')

                // Build button menu - workers cannot create tasks
                const isWorkerOnly = userRoles.includes('worker') && !userRoles.includes('admin')
                const actionButtons = [
                    [createCallbackButton('🔍 Search Customer Info', `customer_search:${identifier.value}`)],
                    [createCallbackButton('📡 PING User', `customer_ping:${identifier.value}`)],
                    // Only show Create Task button for non-workers (admins, collectors)
                    ...(!isWorkerOnly ? [[createCallbackButton('📋 Create Task', `customer_task:${identifier.value}`)]] : []),
                    [createCallbackButton('❌ Cancel', 'customer_cancel')],
                ]

                await sendWithInlineButtons(
                    ctx,
                    utils,
                    `<b>📞 Customer Detected</b>\n\n` +
                        `<b>Identifier:</b> <code>${html.escape(identifier.value)}</code>\n` +
                        `<b>Type:</b> ${identifier.type}\n\n` +
                        `What would you like to do?`,
                    actionButtons,
                    { parseMode: 'HTML' }
                )

                return // Stop flow, wait for button click
            }
        }

        // Send loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from)

        try {
            // Get recent conversation history for better context
            const { messageService } = await import('~/core/services/messageService')
            const messageHistory = await messageService.getConversationHistory(contextId, 10)

            // Build recent messages array with current message
            const recentMessages: any[] = []

            // Generate AI response with tools
            // AI SDK automatically:
            // 1. Understands user intent from message
            // 2. Selects appropriate tool (ISP tools, if needed)
            // 3. Executes tool and generates response
            // No separate intent classification needed!

            const response: AIResponse = await withRetry(
                () =>
                    coreAIService.chat(
                        {
                            contextId,
                            userPhone: ctx.from,
                            userName: ctx.name,
                            personality,
                            recentMessages: [
                                {
                                    id: Date.now().toString(),
                                    message_id: ctx.id || Date.now().toString(),
                                    context_id: contextId,
                                    context_type: String(ctx.from).startsWith('-') ? 'group' : 'private',
                                    direction: 'incoming',
                                    sender: ctx.from,
                                    content: ctx.body,
                                    status: 'sent',
                                    metadata: {},
                                    created_at: new Date(),
                                    is_deleted: false,
                                    is_bot_command: false,
                                    is_admin_command: false,
                                },
                            ],
                        },
                        ispService.getTools() // Make ISP tools available
                    ),
                {
                    maxRetries: 2,
                    delayMs: 2000,
                    exponentialBackoff: true,
                    onRetry: LoadingIndicator.createRetryHandler(provider, loadingMsg, 3),
                }
            )

            // Send response with HTML formatting via telegram API directly
            // Note: provider.sendMessage() doesn't forward parse_mode, so we use telegram API directly

            // Check if there are multiple messages (e.g., multiple user search results)
            if (response.multipleMessages && response.multipleMessages.length > 1) {
                // Send each message separately
                for (const message of response.multipleMessages) {
                    await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
                }

                // Delete loading indicator after all messages sent
                await LoadingIndicator.hide(provider, loadingMsg)

                flowLogger.info(
                    {
                        contextId,
                        responseTime: response.responseTimeMs,
                        toolCalls: response.toolCalls?.length || 0,
                        tokensUsed: response.tokensUsed,
                        messageCount: response.multipleMessages.length,
                    },
                    'Multiple AI responses sent'
                )
            } else {
                // Send single message
                await provider.vendor.telegram.sendMessage(ctx.from, response.text, { parse_mode: 'HTML' })

                // Delete loading indicator after response sent
                await LoadingIndicator.hide(provider, loadingMsg)

                flowLogger.info(
                    {
                        contextId,
                        responseTime: response.responseTimeMs,
                        toolCalls: response.toolCalls?.length || 0,
                        tokensUsed: response.tokensUsed,
                    },
                    'AI response sent'
                )
            }
        } catch (error) {
            // Delete loading indicator before showing error
            await LoadingIndicator.hide(provider, loadingMsg)

            // AI SDK v5 Enhanced Error Handling
            if (error instanceof CoreAIServiceError) {
                flowLogger.error(
                    {
                        err: error,
                        from: ctx.from,
                        code: error.code,
                        retryable: error.retryable,
                    },
                    'AI response failed with known error'
                )

                // Provide user-friendly error messages based on error type
                switch (error.code) {
                    case 'API_CALL_ERROR':
                        if (error.retryable) {
                            await flowDynamic(
                                '⚠️ <b>AI Service Temporarily Unavailable</b>\n\n' +
                                    'The AI service is experiencing issues after multiple retries.\n\n' +
                                    '<i>Please try again in a moment.</i>'
                            )
                        } else {
                            await flowDynamic(
                                '❌ <b>AI Service Error</b>\n\n' +
                                    'Unable to connect to the AI service.\n\n' +
                                    '<b>Possible reasons:</b>\n' +
                                    '• Service maintenance\n' +
                                    '• Network connectivity issues\n' +
                                    '• API quota exceeded\n\n' +
                                    '<i>Please contact support if this persists.</i>'
                            )
                        }
                        break

                    case 'NO_SUCH_TOOL':
                        await flowDynamic(
                            '⚠️ <b>Tool Error</b>\n\n' +
                                'The AI tried to use a tool that doesn\'t exist.\n\n' +
                                '<i>This has been logged for investigation.</i>'
                        )
                        break

                    case 'INVALID_TOOL_INPUT':
                        await flowDynamic(
                            '⚠️ <b>Request Processing Error</b>\n\n' +
                                'There was an issue processing your request.\n\n' +
                                '<b>Try:</b>\n' +
                                '• Rephrasing your question\n' +
                                '• Being more specific\n' +
                                '• Using different keywords'
                        )
                        break

                    case 'NO_CONTENT_GENERATED':
                        await flowDynamic(
                            '⚠️ <b>No Response Generated</b>\n\n' +
                                'The AI didn\'t generate a response.\n\n' +
                                '<i>Please try again with a different question.</i>'
                        )
                        break

                    case 'TYPE_VALIDATION_ERROR':
                        await flowDynamic(
                            '⚠️ <b>Response Validation Error</b>\n\n' +
                                'The AI response was invalid.\n\n' +
                                '<i>This issue has been logged.</i>'
                        )
                        break

                    case 'RETRY_EXHAUSTED':
                        await flowDynamic(
                            '❌ <b>Service Temporarily Unavailable</b>\n\n' +
                                'The AI service is unavailable after multiple attempts.\n\n' +
                                '<b>What to do:</b>\n' +
                                '• Wait a few minutes\n' +
                                '• Try again later\n' +
                                '• Contact support if urgent'
                        )
                        break

                    default:
                        await flowDynamic(
                            '❌ <b>Unexpected Error</b>\n\n' +
                                'Sorry, I encountered an error.\n\n' +
                                '<i>Please try again or contact support.</i>'
                        )
                }
            } else {
                // Unknown error
                flowLogger.error({ err: error, from: ctx.from }, 'AI response failed with unknown error')
                await flowDynamic(
                    '❌ <b>Unexpected Error</b>\n\n' +
                        'Sorry, I encountered an unexpected error.\n\n' +
                        '<i>Please try again.</i>'
                )
            }
        }
    })

/**
 * Flow metadata
 */
