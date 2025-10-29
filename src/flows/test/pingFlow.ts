import { addKeyword } from '@builderbot/bot'
import type { BotContext, TFlow } from '@builderbot/bot/dist/types'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('ping')

/**
 * Ping Flow - Test interactive messages
 *
 * This flow demonstrates different message types:
 * - Simple text response
 * - Multiple messages
 * - Dynamic responses
 * - Number-based menu (Telegram-friendly alternative to buttons)
 */
export const pingFlow: TFlow<TelegramProvider, Database> = addKeyword<TelegramProvider, Database>(['ping', '/ping'])
    .addAnswer('🏓 Pong!')
    .addAnswer([
        '✅ Bot is working correctly!',
        '',
        '📊 System Status:',
        '- Database: Connected',
        '- Telegram: Active',
        '- Server: Running',
    ])
    .addAction(async (ctx: BotContext, { flowDynamic }) => {
        logger.info({ from: ctx.from }, 'Ping command received')

        const timestamp = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Beirut',
            dateStyle: 'medium',
            timeStyle: 'medium',
        })

        await flowDynamic(`⏰ Server Time: ${timestamp}`)

        // Demonstrate a simple "button-like" response with numbered options
        await flowDynamic([
            '',
            '📋 Quick Actions:',
            '1️⃣ Check Status',
            '2️⃣ View Help',
            '3️⃣ Contact Support',
            '',
            'Reply with a number to continue...',
        ])
    })
    .addAnswer(
        'Which option would you like?',
        { capture: true },
        async (ctx: BotContext, { flowDynamic, fallBack }) => {
            const option = ctx.body.trim()

            switch (option) {
                case '1':
                case '1️⃣':
                    await flowDynamic('✅ All systems operational!')
                    break
                case '2':
                case '2️⃣':
                    await flowDynamic('📚 Help: Type "help" to see available commands')
                    break
                case '3':
                case '3️⃣':
                    await flowDynamic('📞 Support: Contact us via admin commands')
                    break
                default:
                    await flowDynamic('❌ Invalid option. Please reply with 1, 2, or 3')
                    return fallBack()
            }

            logger.info({ from: ctx.from, option }, 'Ping option selected')
        }
    )
