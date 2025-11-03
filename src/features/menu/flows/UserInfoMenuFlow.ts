/**
 * User Info Menu Flow
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { getContextId } from '~/core/utils/contextId'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'

const flowLogger = createFlowLogger('user-info-menu')

/**
 * User Info Menu - ISP query options
 * Note: This flow is currently not used in the main menu (menu is admin-only)
 * but kept for potential future use or direct button access
 */
export const userInfoMenuFlow = addKeyword<TelegramProvider, Database>('BUTTON_MENU_USERINFO')
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from }, 'User info menu opened')

        await sendWithInlineButtons(
            ctx,
            utils,
            '👤 <b>User Information</b>\n\n' + 'What would you like to check?',
            [
                [createCallbackButton('🔍 Check Customer', 'userinfo_check')],
                [createCallbackButton('← Back to Menu', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Check Customer - Inline ISP query
 */
export const checkCustomerFlow = addKeyword<TelegramProvider, Database>('BUTTON_USERINFO_CHECK')
    .addAnswer(
        '📞 <b>Customer Lookup</b>\n\n' +
            'Please send the customer phone number or username.\n\n' +
            '<b>Examples:</b>\n' +
            '• 123456789\n' +
            '• username\n' +
            '• john_doe\n\n' +
            '<i>Reply "cancel" to stop</i>',
        { capture: true },
        async (ctx, { flowDynamic, endFlow, extensions, provider }) => {
            const input = ctx.body.trim()

            // Check for cancellation
            if (input.toLowerCase() === 'cancel') {
                await flowDynamic('✅ Cancelled.')
                return endFlow()
            }

            const { coreAIService, ispService, userManagementService } = extensions!

            // Get personality
            const contextId = getContextId(ctx.from)
            const personality = await userManagementService.getPersonality(contextId)

            if (!personality) {
                await flowDynamic('⚠️ Please set up your bot personality first using `/setup`')
                return endFlow()
            }

            // Show loading indicator
            const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '🔍 Searching...')

            try{
                // Query via AI with ISP tools
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
                                content: `Check ${input}`,
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

                // Delete loading indicator
                await LoadingIndicator.hide(provider, loadingMsg)

                // Send response
                if (response.multipleMessages && response.multipleMessages.length > 1) {
                    for (const message of response.multipleMessages) {
                        await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
                    }
                } else {
                    await provider.vendor.telegram.sendMessage(ctx.from, response.text, { parse_mode: 'HTML' })
                }
            } catch (error) {
                // Delete loading indicator on error
                await LoadingIndicator.hide(provider, loadingMsg)

                flowLogger.error({ err: error, from: ctx.from }, 'Customer lookup failed')
                await flowDynamic('❌ Failed to retrieve customer information. Please try again.')
            }
        }
    )

