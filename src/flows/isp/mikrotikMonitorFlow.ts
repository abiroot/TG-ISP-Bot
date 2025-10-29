import { addKeyword } from '@builderbot/bot'
import type { BotContext, TFlow } from '@builderbot/bot/dist/types'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runUserMiddleware } from '~/middleware/pipeline'
import { ispApiService } from '~/services/ispApiService'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('mikrotik-monitor')

// Mikrotik interface monitoring command - for production use
export const mikrotikUsersFlow: TFlow<TelegramProvider, Database> = addKeyword<TelegramProvider, Database>(['mikrotik users'])
    .addAnswer('📡 **Mikrotik Interface Monitor**\n\nPlease enter the interface name you want to monitor.\n\n**Example:** `(VM-PPPoe2)-vlan1403-MANOLLY-TO-TOURELLE`',
    { capture: true },
    async (ctx: BotContext, utils) => {
        try {
            const result = await runUserMiddleware(ctx, utils)
            if (!result.allowed) return
            const personality = result.personality!
            const { flowDynamic, fallBack } = utils

            const interfaceName = ctx.body.trim()

            // Basic validation
            if (!interfaceName || interfaceName.length < 5) {
                await flowDynamic('❌ Please enter a valid interface name.\n\n**Example:** `(VM-PPPoe2)-vlan1403-MANOLLY-TO-TOURELLE`')
                return fallBack()
            }

            logger.info({ from: ctx.from, interfaceName }, 'Mikrotik interface monitoring query')

            await flowDynamic(`📡 **Monitoring Interface:** \`${interfaceName}\``)

            const users = await ispApiService.getMikrotikUserList(interfaceName)
            const formattedResult = ispApiService.formatMikrotikUserList(users, interfaceName)

            await flowDynamic(formattedResult)

        } catch (error) {
            logger.error({ err: error, from: ctx.from }, 'Mikrotik interface monitoring failed')
            const { flowDynamic } = utils
            await flowDynamic(`❌ **Interface Monitoring Failed**\n\nUnable to retrieve users for interface.\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n💡 Please verify the interface name and try again.`)
        }
    })

// Alternative entry point for interface monitoring
export const mikrotikMonitorFlow: TFlow<TelegramProvider, Database> = addKeyword<TelegramProvider, Database>(['mikrotik monitor', '/mikrotik-monitor'])
    .addAnswer('📡 **Mikrotik Interface Monitor**\n\nPlease enter the interface name you want to monitor.\n\n**Examples:**\n• `(VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1`\n• `(VM-PPPoe2)-vlan1403-MANOLLY-TO-TOURELLE`\n\n**Quick Command:** `mikrotik users` (then enter interface name)',
    { capture: true },
    async (ctx: BotContext, utils) => {
        try {
            const result = await runUserMiddleware(ctx, utils)
            if (!result.allowed) return
            const personality = result.personality!
            const { flowDynamic, fallBack } = utils

            const interfaceName = ctx.body.trim()

            // Basic validation
            if (!interfaceName || interfaceName.length < 5) {
                await flowDynamic('❌ Please enter a valid interface name.\n\n**Example:** `(VM-PPPoe2)-vlan1403-MANOLLY-TO-TOURELLE`')
                return fallBack()
            }

            logger.info({ from: ctx.from, interfaceName }, 'Interactive Mikrotik interface monitoring')

            await flowDynamic(`📡 **Monitoring Interface:** \`${interfaceName}\``)

            const users = await ispApiService.getMikrotikUserList(interfaceName)
            const formattedResult = ispApiService.formatMikrotikUserList(users, interfaceName)

            await flowDynamic(formattedResult)

            logger.info({
                interfaceName,
                userCount: users.length,
                onlineUsers: users.filter(u => u.online).length
            }, 'Mikrotik interface monitoring completed successfully')

        } catch (error) {
            logger.error({ err: error, from: ctx.from }, 'Interactive Mikrotik monitoring failed')
            const { flowDynamic } = utils

            await flowDynamic('❌ **Interface Monitoring Failed**\n\nUnable to monitor the specified interface. Please check:\n\n• Interface name is correct\n• Interface exists in the system\n• Network connection is stable\n\n**Error:** ' + (error instanceof Error ? error.message : 'Unknown error') + '\n\n💡 Try again or contact support if the issue persists.')
        }
    }
)