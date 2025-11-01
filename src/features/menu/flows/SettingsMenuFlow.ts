/**
 * Settings Menu Flow
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { getContextId } from '~/core/utils/contextId'

const flowLogger = createFlowLogger('settings-menu')

/**
 * Settings Menu - Bot configuration options
 */
export const settingsMenuFlow = addKeyword<TelegramProvider, Database>('BUTTON_MENU_SETTINGS')
    .addAction(async (ctx, utils) => {
        const { userManagementService } = utils.extensions!

        flowLogger.info({ from: ctx.from }, 'Settings menu opened')

        // Get current personality settings
        const contextId = getContextId(ctx.from)
        const personality = await userManagementService.getPersonality(contextId)

        const currentSettings = personality
            ? `\n\n<i>Current Settings:</i>\n` +
              `• Bot Name: ${personality.bot_name}\n` +
              `• Language: ${personality.default_language}\n` +
              `• Timezone: ${personality.default_timezone}`
            : '\n\n<i>No settings configured yet</i>'

        await sendWithInlineButtons(
            ctx,
            utils,
            `⚙️ <b>Settings</b>${currentSettings}`,
            [
                [createCallbackButton('✏️ Update Personality', 'settings_personality')],
                [createCallbackButton('← Back to Menu', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Update Personality - Route to onboarding flow
 */
export const updatePersonalityFlow = addKeyword<TelegramProvider, Database>('BUTTON_SETTINGS_PERSONALITY')
    .addAction(async (ctx, { gotoFlow }) => {
        flowLogger.info({ from: ctx.from }, 'Routing to onboarding flow for personality update')

        const { onboardingWelcomeFlow } = await import('~/features/onboarding/flows')
        return gotoFlow(onboardingWelcomeFlow)
    })
