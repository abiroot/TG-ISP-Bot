import { addKeyword } from '@builderbot/bot'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runUserMiddleware } from '~/middleware/pipeline'
import { isAdmin } from '~/config/admins'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('user-help')

/**
 * User Help Flow
 * Shows all available user commands
 * Accessible to all whitelisted users
 */
export const userHelpFlow = addKeyword<Provider, Database>(['help', '/help'], {
    sensitive: false,
})
    .addAction(async (ctx, utils) => {
        // Run user middleware (whitelist, rate limit, maintenance checks)
        const result = await runUserMiddleware(ctx, utils)
        if (!result.allowed) return

        flowLogger.info({ user: ctx.from }, 'User requested help')

        const userIsAdmin = isAdmin(ctx.from)

        let helpMessage = `📚 *Available Commands*

*💬 General*
• Just chat with me naturally - I'll understand!
• Send voice notes - I can transcribe them
• Send images - I can analyze them
• Ask about customer information and technical support

*⚙️ Bot Configuration*
• \`/setup personality\` - Configure bot settings
• \`/update personality\` - Update bot settings

*🌐 ISP Support*
• "Check +1234567890" - Look up customer information
• "Is customer online?" - Check account status
• "What's the IP for customer?" - Get technical details
• "Check billing for +1234567890" - View billing information

*🗑️ Privacy*
• \`/wipedata\` - Delete ALL your personal data

*❓ Help*
• \`/help\` - Show this message`

        if (userIsAdmin) {
            helpMessage += `\n\n*🔧 Admin Access*
• \`/admin help\` - View admin commands

✅ You have *administrator* privileges`
        }

        await utils.flowDynamic(helpMessage)
    })
