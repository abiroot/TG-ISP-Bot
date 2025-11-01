/**
 * Help Menu Flow
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'

const flowLogger = createFlowLogger('help-menu')

/**
 * Help Menu - Documentation and support
 */
export const helpMenuFlow = addKeyword<TelegramProvider, Database>('BUTTON_MENU_HELP')
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from }, 'Help menu opened')

        await sendWithInlineButtons(
            ctx,
            utils,
            'ℹ️ <b>Help & Documentation</b>\n\n' + 'Choose a topic:',
            [
                [createCallbackButton('🚀 Getting Started', 'help_start')],
                [createCallbackButton('💬 Commands', 'help_commands')],
                [createCallbackButton('🌐 ISP Queries', 'help_isp')],
                [createCallbackButton('← Back to Menu', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Getting Started Guide
 */
export const helpStartFlow = addKeyword<TelegramProvider, Database>('BUTTON_HELP_START')
    .addAction(async (ctx, utils) => {
        await sendWithInlineButtons(
            ctx,
            utils,
            '🚀 <b>Getting Started</b>\n\n' +
                '<b>1. Set up your personality:</b>\n' +
                'Send <code>/setup</code> to configure the bot\n\n' +
                '<b>2. Ask me anything:</b>\n' +
                'I can answer questions naturally\n\n' +
                '<b>3. Check customer info:</b>\n' +
                'Send <code>check [phone]</code>\n\n' +
                '<b>4. Use the menu:</b>\n' +
                'Type <code>/menu</code> anytime for quick access',
            [[createCallbackButton('← Back to Help', 'menu_help')]],
            { parseMode: 'HTML' }
        )
    })

/**
 * Commands Reference
 */
export const helpCommandsFlow = addKeyword<TelegramProvider, Database>('BUTTON_HELP_COMMANDS')
    .addAction(async (ctx, utils) => {
        await sendWithInlineButtons(
            ctx,
            utils,
            '💬 <b>Available Commands</b>\n\n' +
                '<b>General:</b>\n' +
                '• <code>/menu</code> - Show main menu\n' +
                '• <code>/help</code> - Show help\n' +
                '• <code>/version</code> - Bot version\n\n' +
                '<b>Configuration:</b>\n' +
                '• <code>/setup</code> - Configure bot\n\n' +
                '<b>ISP Support:</b>\n' +
                '• <code>check [phone]</code> - Customer lookup\n' +
                '• <code>lookup [username]</code> - Find user\n\n' +
                '<b>Privacy:</b>\n' +
                '• <code>/wipedata</code> - Delete all your data',
            [[createCallbackButton('← Back to Help', 'menu_help')]],
            { parseMode: 'HTML' }
        )
    })

/**
 * ISP Queries Help
 */
export const helpISPFlow = addKeyword<TelegramProvider, Database>('BUTTON_HELP_ISP')
    .addAction(async (ctx, utils) => {
        await sendWithInlineButtons(
            ctx,
            utils,
            '🌐 <b>ISP Query Guide</b>\n\n' +
                '<b>Check customer information:</b>\n' +
                '• <code>check 123456789</code>\n' +
                '• <code>lookup username</code>\n' +
                '• <code>info customer</code>\n\n' +
                '<b>What you\'ll get:</b>\n' +
                '• Account status\n' +
                '• Service details\n' +
                '• Network information\n' +
                '• Billing details\n\n' +
                '<b>Examples:</b>\n' +
                '<code>check dimetrejradi</code>\n' +
                '<code>lookup john_doe</code>',
            [[createCallbackButton('← Back to Help', 'menu_help')]],
            { parseMode: 'HTML' }
        )
    })
