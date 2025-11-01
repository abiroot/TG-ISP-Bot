/**
 * Onboarding Welcome Flow
 *
 * Simple welcome message that starts bot name input.
 */

import { addKeyword } from '@builderbot/bot'
import { createFlowLogger } from '~/core/utils/logger'
import type { OnboardingStateService } from '../services/OnboardingStateService.js'

const logger = createFlowLogger('OnboardingWelcome')

/**
 * Welcome screen flow - starts onboarding
 */
export const onboardingWelcomeFlow = addKeyword<any>([
    '/onboarding',
    '/start',
    'ONBOARDING_START'
])
    .addAction(async (ctx, { provider }) => {
        logger.info({ from: ctx.from }, 'Starting onboarding')

        // Send welcome message and prompt for name
        await provider.vendor.telegram.sendMessage(
            ctx.from,
            '👋 <b>Welcome!</b>\n\n' +
            'Let\'s set up your bot!\n\n' +
            '🤖 What should I call myself?\n\n' +
            '<i>Please type a bot name (2-50 characters)</i>',
            { parse_mode: 'HTML' }
        )
    })
    .addAnswer(
        '', // Empty since we already sent the message
        { capture: true },
        async (ctx, { gotoFlow, provider, extensions }) => {
            const { onboardingStateService } = extensions as { onboardingStateService: OnboardingStateService }
            const botName = ctx.body.trim()

            logger.info({ from: ctx.from, botName }, 'Bot name received')

            // Basic validation
            if (botName.length < 2 || botName.length > 50) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ Bot name must be between 2-50 characters. Please try again:',
                    { parse_mode: 'HTML' }
                )
                return // Stay in this flow for retry
            }

            // Complete onboarding - upsert personality
            try {
                const { userManagementService } = extensions as any

                await userManagementService.upsertPersonality({
                    context_id: ctx.from,
                    context_type: 'private',
                    bot_name: botName,
                    created_by: ctx.from,
                })

                // Clear temporary state
                await onboardingStateService.clearState(ctx.from)

                logger.info({ from: ctx.from, botName }, 'Onboarding completed successfully')

                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    `✅ <b>Setup Complete!</b>\n\n` +
                    `I'm <b>${botName}</b>, your ISP support assistant.\n\n` +
                    `You can now start chatting with me for any ISP-related queries!`,
                    { parse_mode: 'HTML' }
                )
            } catch (error) {
                logger.error({ err: error, from: ctx.from }, 'Failed to complete onboarding')
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ Failed to complete setup. Please try again or contact support.',
                    { parse_mode: 'HTML' }
                )
                return
            }
        }
    )
