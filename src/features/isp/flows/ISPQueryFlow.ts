/**
 * ISP Query Flow (v2)
 *
 * Consolidates 2 flows into 1:
 * - userInfoFlow
 * - manualPhoneEntryFlow
 *
 * Single unified flow for all ISP queries.
 * AI SDK automatically routes to appropriate tool.
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { AIResponse } from '~/features/conversation/services/CoreAIService'
import { withRetry } from '~/core/utils/flowRetry'
import { startIdleTimer, clearIdleTimer, TIMEOUT_PRESETS } from '~/core/utils/flowTimeout'
import { getContextId } from '~/core/utils/contextId'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'

const flowLogger = createFlowLogger('isp-query')

/**
 * ISP Query Flow - Unified customer lookup
 *
 * This flow is triggered by intent classification in welcomeFlow
 * or by direct commands like "check", "lookup", "info"
 */
export const ispQueryFlow = addKeyword<TelegramProvider, Database>([
    'check',
    'lookup',
    'info',
    'customer',
    'user info',
    '/check',
    '/lookup',
    'EVENT_ISP_QUERY',
])
    .addAction(async (ctx, { flowDynamic, gotoFlow, state, extensions, provider, endFlow }) => {
        const { coreAIService, ispService, userManagementService } = extensions!

        flowLogger.info({ from: ctx.from, body: ctx.body }, 'ISP query flow triggered')

        let loadingMsg

        try {
            // Get personality
            const contextId = getContextId(ctx.from)
            const personality = await userManagementService.getPersonality(contextId)

            if (!personality) {
                await flowDynamic('⚠️ Please set up your bot personality first using `/setup`')
                return
            }

            // Extract identifier from message (no fallback to Telegram ID)
            const identifier = ispService.extractPhoneNumberFromMessage(ctx.body)

            if (!identifier) {
                await flowDynamic(
                    '📞 <b>User Identifier Required</b>\n\n' +
                        'Please provide a phone number or username.\n\n' +
                        '<b>Examples:</b>\n' +
                        '• Check +1234567890\n' +
                        '• Get info for josianeyoussef\n' +
                        '• Lookup john_doe\n\n' +
                        '<i>Reply "cancel" to stop</i>'
                )

                // Capture next message as identifier
                await state.update({ awaitingIdentifier: true })

                // Start timeout timer (2 minutes)
                await startIdleTimer(ctx, state, TIMEOUT_PRESETS.QUERY, async () => {
                    await state.clear()
                    await flowDynamic('⏰ Query timeout. Please start over if you still need information.')
                    return endFlow()
                })

                return
            }

            // Send loading indicator
            loadingMsg = await LoadingIndicator.show(provider, ctx.from, '🔍 Searching...')

            // Execute ISP query via AI service with tools
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
                                    context_type: 'private',
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
                        ispService.getTools() // ISP tools available
                    ),
                {
                    maxRetries: 3,
                    delayMs: 1000,
                    exponentialBackoff: true,
                    onRetry: LoadingIndicator.createRetryHandler(provider, loadingMsg, 4),
                }
            )

            // Delete loading indicator before sending response
            await LoadingIndicator.hide(provider, loadingMsg)

            // Send response with HTML formatting via telegram API directly
            // Note: provider.sendMessage() doesn't forward parse_mode, so we use telegram API directly

            // Check if there are multiple messages (e.g., multiple user search results)
            if (response.multipleMessages && response.multipleMessages.length > 1) {
                // Send each message separately
                for (const message of response.multipleMessages) {
                    await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
                }

                flowLogger.info(
                    {
                        from: ctx.from,
                        identifier,
                        toolCalls: response.toolCalls?.length || 0,
                        responseTime: response.responseTimeMs,
                        messageCount: response.multipleMessages.length,
                    },
                    'ISP query completed with multiple results'
                )
            } else {
                // Send single message
                await provider.vendor.telegram.sendMessage(ctx.from, response.text, { parse_mode: 'HTML' })

                flowLogger.info(
                    {
                        from: ctx.from,
                        identifier,
                        toolCalls: response.toolCalls?.length || 0,
                        responseTime: response.responseTimeMs,
                    },
                    'ISP query completed'
                )
            }
        } catch (error) {
            // Delete loading indicator on error
            await LoadingIndicator.hide(provider, loadingMsg)

            flowLogger.error({ err: error, from: ctx.from }, 'ISP query failed')

            // Provide contextual error message
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>ISP Query Failed</b>\n\n' +
                    'Unable to retrieve customer information.\n\n' +
                    '<b>Possible reasons:</b>\n' +
                    '• Customer not found in system\n' +
                    '• ISP API temporarily unavailable\n' +
                    '• Invalid phone number format\n' +
                    '• Network connectivity issues\n\n' +
                    '<b>Next steps:</b>\n' +
                    '• Verify the phone number/username\n' +
                    '• Try again in a few moments\n' +
                    '• Contact support if urgent',
                { parse_mode: 'HTML' }
            )
        }
    })
    .addAnswer(
        '',
        { capture: true },
        async (ctx, { flowDynamic, state, extensions, provider, endFlow }) => {
            const awaitingIdentifier = await state.get<boolean>('awaitingIdentifier')

            if (!awaitingIdentifier) {
                return // Not in identifier capture mode
            }

            try {
                const { coreAIService, ispService, userManagementService } = extensions!

                // Check for cancellation
                if (ctx.body.toLowerCase().trim() === 'cancel') {
                    await clearIdleTimer(ctx.from)
                    await state.clear()
                    await flowDynamic('✅ Query cancelled.')
                    return endFlow()
                }

                // Extract identifier from captured message (no fallback to Telegram ID)
                const identifier = ispService.extractPhoneNumberFromMessage(ctx.body)

                if (!identifier) {
                    await flowDynamic(
                        '❌ <b>Invalid Identifier</b>\n\n' +
                            'Please provide a valid phone number or username.\n\n' +
                            '<i>Reply "cancel" to stop</i>'
                    )
                    return
                }

                // Clear state and timer
                await clearIdleTimer(ctx.from)
                await state.clear()

                // Send loading indicator
                const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '🔍 Searching...')

                // Execute query with retry
                const contextId = getContextId(ctx.from)
                const personality = await userManagementService.getPersonality(contextId)

                if (!personality) {
                    await LoadingIndicator.hide(provider, loadingMsg)
                    await flowDynamic('⚠️ Please set up your bot personality first using `/setup`')
                    return
                }

                const response: AIResponse = await withRetry(
                    () =>
                        coreAIService.chat(
                            {
                                contextId,
                                userPhone: ctx.from,
                                userName: ctx.name,
                                personality: personality!,
                                recentMessages: [
                                    {
                                        id: Date.now().toString(),
                                        message_id: ctx.id || Date.now().toString(),
                                        context_id: contextId,
                                        context_type: 'private',
                                        direction: 'incoming',
                                        sender: ctx.from,
                                        content: `Check ${identifier}`,
                                        status: 'sent',
                                        metadata: {},
                                        created_at: new Date(),
                                        is_deleted: false,
                                        is_bot_command: false,
                                        is_admin_command: false,
                                    },
                                ],
                            },
                            ispService.getTools()
                        ),
                    {
                        maxRetries: 3,
                        delayMs: 1000,
                        exponentialBackoff: true,
                        onRetry: LoadingIndicator.createRetryHandler(provider, loadingMsg, 4),
                    }
                )

                // Delete loading indicator
                await LoadingIndicator.hide(provider, loadingMsg)

                // Check if there are multiple messages (e.g., multiple user search results)
                if (response.multipleMessages && response.multipleMessages.length > 1) {
                    // Send each message separately
                    for (const message of response.multipleMessages) {
                        await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
                    }
                } else {
                    // Send single message
                    await provider.vendor.telegram.sendMessage(ctx.from, response.text, { parse_mode: 'HTML' })
                }
            } catch (error) {
                // Always clear state on error
                await clearIdleTimer(ctx.from)
                await state.clear()

                flowLogger.error({ err: error, from: ctx.from }, 'ISP query capture failed')

                await flowDynamic(
                    '❌ <b>Query Failed</b>\n\n' +
                        'Unable to complete your query.\n\n' +
                        '<i>Please try again or contact support.</i>'
                )
            }
        }
    )

/**
 * Flow metadata
 */
