/**
 * Dynamic Flow Routing Example
 *
 * Demonstrates BuilderBot's gotoFlow pattern for conditional routing
 * Based on BuilderBot best practices showcase
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { personalityService } from '~/services/personalityService'
import { whitelistService } from '~/services/whitelistService'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('routing-example')

/**
 * New User Flow - For users without personality setup
 */
export const newUserFlow = addKeyword<TelegramProvider, Database>('__new_user__')
    .addAnswer(
        '👋 *Welcome to ISP Support Bot!*\n\n' +
            "I'm here to help you with customer support and technical assistance.\n\n" +
            'Before we get started, I need to configure a few things.\n' +
            'Send "setup" to begin configuration.',
        { delay: 500 }
    )

/**
 * Returning User Flow - For users with existing personality
 */
export const returningUserFlow = addKeyword<TelegramProvider, Database>('__returning_user__')
    .addAnswer(
        '👋 *Welcome back!*\n\n' +
            'How can I help you today?\n\n' +
            '• Customer information lookup\n' +
            '• Account status checks\n' +
            '• Technical support\n' +
            '• Send "help" for more options',
        { delay: 500 }
    )

/**
 * Whitelisted Group Flow - For group chats
 */
export const whitelistedGroupFlow = addKeyword<TelegramProvider, Database>('__whitelisted_group__')
    .addAnswer(
        '👋 *Hello everyone!*\n\n' +
            "I'm ready to help with ISP customer support.\n\n" +
            '• Customer lookups\n' +
            '• Technical support queries\n' +
            '• Send "group help" for more options',
        { delay: 500 }
    )

/**
 * Not Whitelisted Flow - For non-whitelisted users
 */
export const notWhitelistedFlow = addKeyword<TelegramProvider, Database>('__not_whitelisted__')
    .addAnswer(
        '⚠️ *Access Required*\n\n' +
            "I'm currently in private mode.\n" +
            'Please contact an administrator to get access.',
        { delay: 500 }
    )

/**
 * Example: Dynamic Routing based on User Status
 *
 * This demonstrates how to use gotoFlow to route users dynamically
 */
export const dynamicWelcomeFlow = addKeyword<TelegramProvider, Database>(['start', '/start'], {
    sensitive: false,
})
    .addAction(async (ctx, { gotoFlow, state, flowDynamic }) => {
        flowLogger.info({ from: ctx.from }, 'Dynamic routing - checking user status')

        // 1. Check if whitelisted
        const contextId = personalityService.getContextId(ctx.from)
        const contextType = personalityService.getContextType(ctx.from)
        const isGroup = contextType === 'group'

        const whitelisted = await whitelistService.isWhitelisted(contextId, isGroup)

        if (!whitelisted) {
            flowLogger.info({ from: ctx.from }, 'Routing to: not whitelisted flow')
            return gotoFlow(notWhitelistedFlow)
        }

        // 2. Check if personality exists
        const personality = await personalityService.getPersonality(contextId)

        if (!personality) {
            flowLogger.info({ from: ctx.from }, 'Routing to: new user flow')
            return gotoFlow(newUserFlow)
        }

        // 3. Route based on context type
        if (isGroup) {
            flowLogger.info({ from: ctx.from }, 'Routing to: whitelisted group flow')
            return gotoFlow(whitelistedGroupFlow)
        }

        // 4. Default: returning user
        flowLogger.info({ from: ctx.from, botName: personality.bot_name }, 'Routing to: returning user flow')
        await state.update({ personality })
        return gotoFlow(returningUserFlow)
    })

/**
 * Example: Conditional Routing based on External Data
 */
export const dataBasedRoutingFlow = addKeyword<TelegramProvider, Database>(['check status'], {
    sensitive: false,
})
    .addAction(async (ctx, { gotoFlow, flowDynamic }) => {
        flowLogger.info({ from: ctx.from }, 'Data-based routing - checking external status')

        try {
            // Example: Check external API or database
            const contextId = personalityService.getContextId(ctx.from)
            const personality = await personalityService.getPersonality(contextId)

            // Route based on data
            if (!personality) {
                await flowDynamic('⚠️ No configuration found. Setting up...')
                return gotoFlow(newUserFlow)
            }

            // Check specific conditions
            await flowDynamic(`🌐 Welcome back ${personality.bot_name}! Ready to assist with ISP support.`)

            return gotoFlow(returningUserFlow)
        } catch (error) {
            flowLogger.error({ err: error }, 'Error in data-based routing')
            await flowDynamic('❌ Error checking status. Please try again.')
        }
    })

/**
 * Example: Multi-step routing with user choice
 */
export const choiceBasedRoutingFlow = addKeyword<TelegramProvider, Database>(['menu', '/menu'], {
    sensitive: false,
})
    .addAnswer(
        '*Main Menu*\n\n' +
            '1️⃣ Track new expense\n' +
            '2️⃣ View reports\n' +
            '3️⃣ Settings\n' +
            '4️⃣ Help\n\n' +
            'Reply with a number (1-4)',
        { capture: true },
        async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
            const choice = ctx.body.trim()

            switch (choice) {
                case '1':
                    await flowDynamic('📝 Tracking new expense...')
                    // return gotoFlow(expenseTrackingFlow)
                    break
                case '2':
                    await flowDynamic('📊 Loading reports...')
                    // return gotoFlow(reportsFlow)
                    break
                case '3':
                    await flowDynamic('⚙️ Opening settings...')
                    // return gotoFlow(settingsFlow)
                    break
                case '4':
                    await flowDynamic('❓ Help & Documentation...')
                    // return gotoFlow(helpFlow)
                    break
                default:
                    await flowDynamic('⚠️ Invalid choice. Please select 1-4')
                    return fallBack()
            }
        }
    )
