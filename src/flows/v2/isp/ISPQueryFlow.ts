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
import { createFlowLogger } from '~/utils/logger'

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
    .addAction(async (ctx, { flowDynamic, gotoFlow, state, extensions, provider }) => {
        const { coreAIService, ispService, userManagementService } = extensions!

        flowLogger.info({ from: ctx.from, body: ctx.body }, 'ISP query flow triggered')

        // Get personality
        const contextId = userManagementService.getContextId(ctx.from)
        const personality = await userManagementService.getPersonality(contextId)

        if (!personality) {
            await flowDynamic('⚠️ Please set up your bot personality first using `/setup`')
            return
        }

        // Extract identifier from message
        const identifier = ispService.extractPhoneNumberFromMessage(ctx.body, ctx.from)

        if (!identifier) {
            await flowDynamic(
                '📞 **User Identifier Required**\n\n' +
                'Please provide a phone number or username.\n\n' +
                '**Examples:**\n' +
                '• Check +1234567890\n' +
                '• Get info for josianeyoussef\n' +
                '• Lookup john_doe'
            )

            // Capture next message as identifier
            await state.update({ awaitingIdentifier: true })
            return
        }

        // Execute ISP query via AI service with tools
        await flowDynamic('🔍 Searching...')

        try {
            const response = await coreAIService.chat(
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
            )

            // Send response with HTML formatting via telegram API directly
            // Note: provider.sendMessage() doesn't forward parse_mode, so we use telegram API directly
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
        } catch (error) {
            flowLogger.error({ err: error, from: ctx.from }, 'ISP query failed')
            await provider.vendor.telegram.sendMessage(ctx.from, '❌ An error occurred while processing your query. Please try again.', { parse_mode: 'HTML' })
        }
    })
    .addAnswer(
        '',
        { capture: true },
        async (ctx, { flowDynamic, state, extensions, provider }) => {
            const awaitingIdentifier = await state.get<boolean>('awaitingIdentifier')

            if (!awaitingIdentifier) {
                return // Not in identifier capture mode
            }

            const { coreAIService, ispService, userManagementService } = extensions!

            // Extract identifier from captured message
            const identifier = ispService.extractPhoneNumberFromMessage(ctx.body, ctx.from)

            if (!identifier) {
                await flowDynamic('❌ Invalid identifier. Please provide a phone number or username.')
                return
            }

            // Clear state
            await state.clear()

            // Execute query
            await flowDynamic('🔍 Searching...')

            const contextId = userManagementService.getContextId(ctx.from)
            const personality = await userManagementService.getPersonality(contextId)

            const response = await coreAIService.chat(
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
            )

            await provider.vendor.telegram.sendMessage(ctx.from, response.text, { parse_mode: 'HTML' })
        }
    )

/**
 * Flow metadata
 */
