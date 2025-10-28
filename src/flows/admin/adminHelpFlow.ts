import { addKeyword } from '@builderbot/bot'
import { TwilioProvider as Provider } from '@builderbot/provider-twilio'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runAdminMiddleware } from '~/middleware/pipeline'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('admin-help')

/**
 * Admin Help Flow
 * Shows all available admin commands
 * Only accessible to administrators
 */
export const adminHelpFlow = addKeyword<Provider, Database>(['admin help', '/admin help'], {
    sensitive: false,
})
    .addAction(async (ctx, utils) => {
        // Check if user is admin
        const result = await runAdminMiddleware(ctx, utils)
        if (!result.allowed) return

        flowLogger.info({ admin: ctx.from }, 'Admin requested help')

        await utils.flowDynamic(
            `📚 *Admin Commands Help*

*🛡️ Whitelist Management*
• \`/wl group\` - Whitelist current group
• \`/wl number +1234567890\` - Whitelist phone number (inline)
• \`/wl number\` - Whitelist phone number (prompt)
• \`/remove group\` - Remove current group
• \`/remove number\` - Remove phone number
• \`/list whitelist\` - Show all whitelisted items

*🤖 Bot Management*
• \`enable maintenance\` - Enable maintenance mode
• \`disable maintenance\` - Disable maintenance mode
• \`bot status\` - Show bot status & version
• \`toggle ai\` - Toggle AI responses
• \`toggle voice\` - Toggle voice note feature
• \`toggle media\` - Toggle media analysis

*⏱️ Rate Limit Management*
• \`rate limit status\` - Show rate limit config
• \`reset rate limit\` - Reset all rate limits
• \`unblock user\` - Unblock rate-limited user

*👤 User Commands (also available to you)*
• \`/help\` - User commands help
• \`/setup personality\` - Configure bot personality
• \`/wipedata\` - Delete all your data

*📊 Access Level*
✅ You are an *administrator*
✅ You can bypass rate limits & maintenance mode`
        )
    })
