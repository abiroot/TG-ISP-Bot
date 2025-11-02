/**
 * Main Menu Flow
 *
 * Provides button-based navigation to all bot features
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'

const flowLogger = createFlowLogger('main-menu')

/**
 * Main Menu Flow - Entry point for button-based navigation
 *
 * Triggers: /menu, menu, main menu
 */
export const mainMenuFlow = addKeyword<TelegramProvider, Database>(['menu', '/menu', 'main menu'], {
    sensitive: false,
})
    .addAction(async (ctx, utils) => {
        const { userManagementService } = utils.extensions!
        const isAdmin = await userManagementService.isAdmin(ctx.from)

        flowLogger.info({ from: ctx.from, isAdmin }, 'Main menu opened')

        const buttons = [
            [createCallbackButton('👤 User Info', 'menu_userinfo')],
            [createCallbackButton('⚙️ Settings', 'menu_settings')],
            [createCallbackButton('ℹ️ Help', 'menu_help')],
            [createCallbackButton('🗑️ Privacy', 'menu_privacy')],
        ]

        // Add admin menu for admins
        if (isAdmin) {
            buttons.splice(2, 0, [createCallbackButton('🔧 Admin', 'menu_admin')])
        }

        await sendWithInlineButtons(
            ctx,
            utils,
            '📋 <b>Main Menu</b>\n\n' + 'Choose an option:',
            buttons,
            { parseMode: 'HTML' }
        )
    })

/**
 * Back to Menu Flow - Handler for back buttons
 */
export const menuBackFlow = addKeyword<TelegramProvider, Database>('BUTTON_MENU_BACK')
    .addAction(async (ctx, { gotoFlow }) => {
        flowLogger.info({ from: ctx.from }, 'Returning to main menu')
        return gotoFlow(mainMenuFlow)
    })
