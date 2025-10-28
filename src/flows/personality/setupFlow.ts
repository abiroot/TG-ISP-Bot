import { addKeyword } from '@builderbot/bot'
import { TwilioProvider as Provider } from '@builderbot/provider-twilio'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { personalityService } from '~/services/personalityService'
import { startIdleTimer, resetIdleTimer, stopIdleTimer } from '~/utils/idleTimer'
import { dispatchSetupComplete, CUSTOM_EVENTS } from '~/utils/customEvents'

/**
 * Personality Setup Flow - Main Entry Point
 * Triggers: 'setup personality', '/setup personality', 'setup', '/setup'
 * Case-insensitive matching
 */
export const personalitySetupFlow = addKeyword<Provider, Database>(
    ['setup personality', '/setup personality', 'setup', '/setup'],
    { sensitive: false }
)
    .addAction(async (ctx, { flowDynamic, endFlow, state, gotoFlow }) => {
        // Check if personality already exists
        const contextId = personalityService.getContextId(ctx.from)
        const existing = await personalityService.getPersonality(contextId)

        await state.update({ _existing: existing ? 'yes' : 'no' })

        // Start idle timer (5 minutes timeout)
        const TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
        startIdleTimer(ctx, gotoFlow, TIMEOUT_MS, async () => {
            await flowDynamic('⏰ Setup timeout - no response received. Please restart setup with /setup if needed.')
            return endFlow()
        })

        if (existing) {
            // Show current config with delay for natural feel
            await flowDynamic(
                `📋 *Current Configuration:*\n\n` +
                    `🤖 Name: ${existing.bot_name}\n` +
                    `🌍 Timezone: ${existing.default_timezone}\n` +
                    `🗣️ Language: ${existing.default_language}\n\n` +
                    `Let's update your settings.\n\n` +
                    `⏱️ _This setup will timeout after 5 minutes of inactivity._`,
                { delay: 500 } // Small delay for natural conversation feel
            )
        } else {
            // New setup - show welcome with delay
            await flowDynamic(
                '👋 Welcome! Let me get to know you better. This will only take a minute.\n\n' +
                    '⏱️ _This setup will timeout after 5 minutes of inactivity._',
                { delay: 500 }
            )
        }
    })
    .addAnswer(
        '🤖 What should I call myself? (e.g., "ISPSupport", "HelpDesk", "Assistant")\n_Type "cancel" anytime to stop_',
        { capture: true },
        async (ctx, { state, endFlow, flowDynamic, fallBack, gotoFlow }) => {
            const input = ctx.body.trim()

            // Reset idle timer on user response
            const TIMEOUT_MS = 5 * 60 * 1000
            resetIdleTimer(ctx, gotoFlow, TIMEOUT_MS, async () => {
                await flowDynamic('⏰ Setup timeout - no response received. Please restart setup with /setup if needed.')
                return endFlow()
            })

            if (input.toLowerCase() === 'cancel') {
                stopIdleTimer(ctx)
                await flowDynamic('✅ Setup cancelled.')
                return endFlow()
            }

            // Track retry attempts
            const retryCount = state.get('bot_name_retries') || 0

            if (!input) {
                if (retryCount >= 3) {
                    stopIdleTimer(ctx)
                    await flowDynamic('❌ Too many invalid attempts. Setup cancelled. Please restart with /setup.')
                    return endFlow()
                }
                await state.update({ bot_name_retries: retryCount + 1 })
                await flowDynamic(`⚠️ Bot name cannot be empty. Please enter a name. (Attempt ${retryCount + 1}/3)`)
                return fallBack()
            }

            if (input.length < 2 || input.length > 50) {
                if (retryCount >= 3) {
                    stopIdleTimer(ctx)
                    await flowDynamic('❌ Too many invalid attempts. Setup cancelled. Please restart with /setup.')
                    return endFlow()
                }
                await state.update({ bot_name_retries: retryCount + 1 })
                await flowDynamic(`⚠️ Bot name must be between 2-50 characters. (Attempt ${retryCount + 1}/3)`)
                return fallBack()
            }

            await state.update({ bot_name: input, bot_name_retries: 0 })
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
                await flowDynamic('⏰ Setup timeout - no response received. Please restart setup with /setup if needed.')
                return endFlow()
            })

            if (input.toLowerCase() === 'cancel') {
                stopIdleTimer(ctx)
                await flowDynamic('✅ Setup cancelled.')
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
                await flowDynamic('⏰ Setup timeout - no response received. Please restart setup with /setup if needed.')
                return endFlow()
            })

            if (input.toLowerCase() === 'cancel') {
                stopIdleTimer(ctx)
                await flowDynamic('✅ Setup cancelled.')
                return endFlow()
            }

            if (!input) {
                await flowDynamic(
                    '⚠️ Language cannot be empty. Please enter a language (e.g., English, Arabic, French).'
                )
                return fallBack()
            }

            await state.update({ default_language: input })
        }
    )
    .addAction(async (ctx, { state, flowDynamic, provider }) => {
        const contextId = personalityService.getContextId(ctx.from)
        const contextType = personalityService.getContextType(ctx.from)

        // Check if personality exists - update or create
        const existing = await personalityService.getPersonality(contextId)

        try {
            let personality

            if (existing) {
                // Update existing personality
                personality = await personalityService.updatePersonality(contextId, {
                    bot_name: state.get('bot_name'),
                    default_timezone: state.get('default_timezone'),
                    default_language: state.get('default_language'),
                })

                // Stop idle timer on successful completion
                stopIdleTimer(ctx)

                await flowDynamic(`
✅ *Personality Updated!*

I'm now configured as:
🤖 Name: ${personality.bot_name}
🌍 Timezone: ${personality.default_timezone}
🗣️ Language: ${personality.default_language}

You can update this anytime by sending "/setup" again.
                `.trim())

                // Dispatch custom event for setup update
                dispatchSetupComplete(provider, ctx.from, personality)
            } else {
                // Create new personality
                personality = await personalityService.createPersonality({
                    context_id: contextId,
                    context_type: contextType,
                    bot_name: state.get('bot_name'),
                    default_timezone: state.get('default_timezone'),
                    default_language: state.get('default_language'),
                    created_by: ctx.from,
                })

                // Stop idle timer on successful completion
                stopIdleTimer(ctx)

                await flowDynamic(`
✅ *Setup Complete!*

I'm now configured as:
🤖 Name: ${personality.bot_name}
🌍 Timezone: ${personality.default_timezone}
🗣️ Language: ${personality.default_language}

You can now start chatting with me! I'm here to help you with ISP support and user information queries.
You can update this anytime by sending "/setup" again.
                `.trim())

                // Dispatch custom event for setup completion
                dispatchSetupComplete(provider, ctx.from, personality)
            }
        } catch (error) {
            console.error('Error saving personality:', error)
            stopIdleTimer(ctx) // Stop timer on error too
            await flowDynamic('❌ Failed to save your preferences. Please try the setup again.')
        }
    })

/**
 * NOTE: updatePersonalityFlow has been removed.
 * Use /setup to update personality settings.
 * The setup flow automatically detects existing personality and asks for confirmation before updating.
 */
