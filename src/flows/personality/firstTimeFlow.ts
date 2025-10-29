import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { personalityService } from '~/services/personalityService'
import { startIdleTimer, resetIdleTimer, stopIdleTimer } from '~/utils/idleTimer'
import { dispatchSetupComplete } from '~/utils/customEvents'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('first-time')

/**
 * First Time User Flow
 * Automatically triggered when a user doesn't have a personality setup
 * Provides a seamless onboarding experience without requiring /setup command
 *
 * Note: Welcome message is sent in welcomeFlow before routing here
 */
export const firstTimeUserFlow = addKeyword<TelegramProvider, Database>('__FIRST_TIME_USER__')
    .addAnswer(
        '🤖 What should I call myself? (e.g., "ISPSupport", "TechAssistant", "HelpDesk")\n_Type "cancel" anytime to stop_',
        { capture: true, delay: 1000 },
        async (ctx, { state, endFlow, flowDynamic, fallBack, gotoFlow }) => {
            const input = ctx.body.trim()

            // Reset idle timer on user response
            const TIMEOUT_MS = 5 * 60 * 1000
            if (!state.get('_timer_started')) {
                startIdleTimer(ctx, gotoFlow, TIMEOUT_MS, async () => {
                    await flowDynamic('⏰ Setup timeout - no response received. Please send any message to restart.')
                    return endFlow()
                })
                await state.update({ _timer_started: true })
            } else {
                resetIdleTimer(ctx, gotoFlow, TIMEOUT_MS, async () => {
                    await flowDynamic('⏰ Setup timeout - no response received. Please send any message to restart.')
                    return endFlow()
                })
            }

            if (input.toLowerCase() === 'cancel') {
                stopIdleTimer(ctx)
                await flowDynamic('✅ Setup cancelled. Send any message to restart.')
                return endFlow()
            }

            // Track retry attempts
            const retryCount = state.get('bot_name_retries') || 0

            if (!input) {
                if (retryCount >= 3) {
                    stopIdleTimer(ctx)
                    await flowDynamic('❌ Too many invalid attempts. Setup cancelled. Please send any message to restart.')
                    return endFlow()
                }
                await state.update({ bot_name_retries: retryCount + 1 })
                await flowDynamic(`⚠️ Bot name cannot be empty. Please enter a name. (Attempt ${retryCount + 1}/3)`)
                return fallBack()
            }

            if (input.length < 2 || input.length > 50) {
                if (retryCount >= 3) {
                    stopIdleTimer(ctx)
                    await flowDynamic('❌ Too many invalid attempts. Setup cancelled. Please send any message to restart.')
                    return endFlow()
                }
                await state.update({ bot_name_retries: retryCount + 1 })
                await flowDynamic(`⚠️ Bot name must be between 2-50 characters. (Attempt ${retryCount + 1}/3)`)
                return fallBack()
            }

            await state.update({ bot_name: input, bot_name_retries: 0 })
            flowLogger.debug({ from: ctx.from, botName: input }, 'Bot name captured')
        }
    )
      .addAnswer(
        '🌍 What is your timezone? (e.g., "Asia/Beirut", "America/New_York", "UTC")',
        { capture: true },
        async (ctx, { state, endFlow, flowDynamic, fallBack, gotoFlow }) => {
            const input = ctx.body.trim()

            // Reset idle timer on user response
            const TIMEOUT_MS = 5 * 60 * 1000
            resetIdleTimer(ctx, gotoFlow, TIMEOUT_MS, async () => {
                await flowDynamic('⏰ Setup timeout - no response received. Please send any message to restart.')
                return endFlow()
            })

            if (input.toLowerCase() === 'cancel') {
                stopIdleTimer(ctx)
                await flowDynamic('✅ Setup cancelled. Send any message to restart.')
                return endFlow()
            }

            if (!input) {
                await flowDynamic('⚠️ Timezone cannot be empty. Please enter a timezone (e.g., Asia/Beirut, UTC).')
                return fallBack()
            }

            if (!/^[A-Za-z_/-]+$/.test(input)) {
                await flowDynamic(
                    `⚠️ "${input}" doesn't look like a valid timezone. Examples: Asia/Beirut, America/New_York, UTC`
                )
                return fallBack()
            }

            await state.update({ default_timezone: input })
            flowLogger.debug({ from: ctx.from, timezone: input }, 'Timezone captured')
        }
    )
    .addAnswer(
        '🗣️ What language should I use? (e.g., "English", "Arabic", "French")',
        { capture: true },
        async (ctx, { state, endFlow, flowDynamic, fallBack, gotoFlow }) => {
            const input = ctx.body.trim()

            // Reset idle timer on user response
            const TIMEOUT_MS = 5 * 60 * 1000
            resetIdleTimer(ctx, gotoFlow, TIMEOUT_MS, async () => {
                await flowDynamic('⏰ Setup timeout - no response received. Please send any message to restart.')
                return endFlow()
            })

            if (input.toLowerCase() === 'cancel') {
                stopIdleTimer(ctx)
                await flowDynamic('✅ Setup cancelled. Send any message to restart.')
                return endFlow()
            }

            if (!input) {
                await flowDynamic(
                    '⚠️ Language cannot be empty. Please enter a language (e.g., English, Arabic, French).'
                )
                return fallBack()
            }

            await state.update({ default_language: input })
            flowLogger.debug({ from: ctx.from, language: input }, 'Language captured')
        }
    )
    .addAction(async (ctx, { state, flowDynamic, provider, endFlow }) => {
        const contextId = personalityService.getContextId(ctx.from)
        const contextType = personalityService.getContextType(ctx.from)

        try {
            // Create new personality
            const personality = await personalityService.createPersonality({
                context_id: contextId,
                context_type: contextType,
                bot_name: state.get('bot_name'),
                default_timezone: state.get('default_timezone'),
                default_language: state.get('default_language'),
                created_by: ctx.from,
            })

            // Stop idle timer on successful completion
            stopIdleTimer(ctx)

            flowLogger.info({ from: ctx.from, botName: personality.bot_name }, 'First-time setup completed')

            await flowDynamic(`
✅ *Setup Complete!*

I'm now configured as:
🤖 Name: ${personality.bot_name}
🌍 Timezone: ${personality.default_timezone}
🗣️ Language: ${personality.default_language}

You can now start chatting with me! I'm here to help you with ISP customer support and technical assistance.
You can update this anytime by sending "/setup".
            `.trim())

            // Dispatch custom event for setup completion
            dispatchSetupComplete(provider, ctx.from, personality)
        } catch (error) {
            flowLogger.error({ err: error, from: ctx.from }, 'Error saving personality')
            stopIdleTimer(ctx) // Stop timer on error too
            await flowDynamic('❌ Failed to save your preferences. Please send any message to restart setup.')
        }

        return endFlow()
    })
