/**
 * Privacy Menu Flow
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { getContextId } from '~/core/utils/contextId'

const flowLogger = createFlowLogger('privacy-menu')

/**
 * Privacy Menu - Data management
 */
export const privacyMenuFlow = addKeyword<TelegramProvider, Database>('BUTTON_MENU_PRIVACY')
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from }, 'Privacy menu opened')

        await sendWithInlineButtons(
            ctx,
            utils,
            '🗑️ <b>Privacy & Data</b>\n\n' + 'Manage your personal data:',
            [
                [createCallbackButton('📊 View My Data', 'privacy_view')],
                [createCallbackButton('🗑️ Delete All Data', 'privacy_delete')],
                [createCallbackButton('← Back to Menu', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * View Data Summary
 */
export const viewDataFlow = addKeyword<TelegramProvider, Database>('BUTTON_PRIVACY_VIEW')
    .addAction(async (ctx, utils) => {
        const { userManagementService } = utils.extensions!
        const { messageService } = await import('~/core/services/messageService')

        flowLogger.info({ from: ctx.from }, 'View data requested')

        const contextId = getContextId(ctx.from)

        try {
            const [personality, messageCount] = await Promise.all([
                userManagementService.getPersonality(contextId),
                messageService.getMessageCount(contextId),
            ])

            await sendWithInlineButtons(
                ctx,
                utils,
                '📊 <b>Your Data Summary</b>\n\n' +
                    `📨 <b>Messages:</b> ${messageCount}\n` +
                    `⚙️ <b>Settings:</b> ${personality ? 'Configured' : 'Not set'}\n` +
                    `🧠 <b>AI History:</b> Stored for better context\n\n` +
                    '<i>Use "Delete All Data" to remove everything</i>',
                [[createCallbackButton('← Back', 'menu_privacy')]],
                { parseMode: 'HTML' }
            )
        } catch (error) {
            flowLogger.error({ err: error, from: ctx.from }, 'Failed to retrieve data summary')
            await utils.flowDynamic('❌ Failed to retrieve your data summary. Please try again.')
        }
    })

/**
 * Delete Data - Route to wipe flow
 */
export const deleteDataFlow = addKeyword<TelegramProvider, Database>('BUTTON_PRIVACY_DELETE')
    .addAction(async (ctx, { gotoFlow }) => {
        flowLogger.info({ from: ctx.from }, 'Routing to data wipe flow')

        const { wipeDataFlow } = await import('~/features/user/flows/WipeDataFlow')
        return gotoFlow(wipeDataFlow)
    })
