/**
 * Main Menu Flow (Admin-Only)
 *
 * Provides button-based navigation to all admin features
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { runAdminMiddleware } from '~/core/middleware/adminMiddleware'

const flowLogger = createFlowLogger('main-menu')

/**
 * Main Menu Flow - Admin-only entry point for button-based navigation
 *
 * Triggers: /menu, menu, main menu
 * Access: Admin only
 */
export const mainMenuFlow = addKeyword<TelegramProvider, Database>(['menu', '/menu', 'main menu'], {
    sensitive: false,
})
    .addAction(async (ctx, utils) => {
        // Admin access control - REQUIRED for admin menu
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        flowLogger.info({ from: ctx.from }, 'Admin menu opened')

        await sendWithInlineButtons(
            ctx,
            utils,
            '🔧 <b>Admin Control Panel</b>\n\n' + 'Choose an action:',
            [
                [createCallbackButton('👥 Whitelist Management', 'admin_whitelist')],
                [createCallbackButton('🤖 Bot Status & Control', 'admin_bot')],
                [createCallbackButton('🛡️ Role Management', 'admin_roles')],
                [createCallbackButton('👤 User Listing', 'admin_users')],
                [createCallbackButton('📍 Unfulfilled Locations', 'admin_locations')],
            ],
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
