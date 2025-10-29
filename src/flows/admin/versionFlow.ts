import { addKeyword } from '@builderbot/bot'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { APP_VERSION } from '~/app'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('version')

/**
 * Version Flow
 * Shows the current bot version and build information
 * Available to all users (not just admins)
 * This helps verify that deployments are running the latest code
 */
export const versionFlow = addKeyword<Provider, Database>(['version', '/version', 'bot version', '/bot version'], {
    sensitive: false,
})
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from }, 'Version requested')

        const uptime = process.uptime()
        const uptimeHours = Math.floor(uptime / 3600)
        const uptimeMinutes = Math.floor((uptime % 3600) / 60)
        const uptimeSeconds = Math.floor(uptime % 60)

        const uptimeString =
            uptimeHours > 0
                ? `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`
                : uptimeMinutes > 0
                  ? `${uptimeMinutes}m ${uptimeSeconds}s`
                  : `${uptimeSeconds}s`

        const message = `🤖 *Bot Version Information*

*Version:* ${APP_VERSION}
*Node.js:* ${process.version}
*Platform:* ${process.platform}
*Uptime:* ${uptimeString}
*Environment:* ${process.env.NODE_ENV || 'development'}

_Type 'version' anytime to check the current bot version_`

        await utils.flowDynamic(message)
    })
