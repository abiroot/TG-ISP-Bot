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
            // Delete loading indicator on error
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
