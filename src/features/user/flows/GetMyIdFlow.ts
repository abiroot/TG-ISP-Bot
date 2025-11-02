/**
 * GetMyIdFlow - Self-service command to get Telegram ID
 *
 * Allows users to retrieve their numeric Telegram ID for whitelisting,
 * admin configuration, or debugging purposes.
 *
 * Commands: /getmyid, /myid, getmyid, myid
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import type { BotCtx } from '~/types'
import { TelegramUserHelper } from '~/core/utils/TelegramUserHelper'
import { html } from '~/core/utils/telegramFormatting'

export const getMyIdFlow = addKeyword<BotCtx>(['/getmyid', '/myid', 'getmyid', 'myid'])
    .addAction(async (ctx, utils) => {
        const telegramId = TelegramUserHelper.getTelegramId(ctx)
        const fullName = TelegramUserHelper.getFullName(ctx)
        const telegramHandle = TelegramUserHelper.getTelegramHandle(ctx)
        const contextType = TelegramUserHelper.getContextType(ctx)

        // Build response message (escape all user-generated content)
        let message = `<b>📋 Your Telegram Information</b>\n\n`
        message += `<b>Name:</b> ${html.escape(fullName)}\n`

        if (telegramHandle) {
            message += `<b>Username:</b> @${html.escape(telegramHandle)}\n`
        }

        message += `<b>Telegram ID:</b> <code>${html.escape(telegramId)}</code>\n`
        message += `<b>Context:</b> ${contextType === 'group' ? 'Group Chat' : 'Private Chat'}\n\n`

        message += `<i>💡 Tip: Tap the ID to copy it. Use this ID for whitelisting or admin configuration.</i>`

        // Send formatted message (HTML parse mode)
        const chatId = ctx.from
        await utils.provider.vendor.telegram.sendMessage(chatId, message, {
            parse_mode: 'HTML',
        })
    })
