import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'

const flowLogger = createFlowLogger('user-help')

/**
 * Enhanced User Help Flow
 * Shows comprehensive role-based command list with user's access level
 * Dynamically displays commands based on:
 * - Admin status
 * - Whitelist status
 * - Assigned roles (admin, collector, worker)
 */
export const userHelpFlow = addKeyword<TelegramProvider, Database>(['help', '/help'], {
    sensitive: false,
})
    .addAction(async (ctx, utils) => {
        const { userManagementService, roleService } = utils.extensions!

        flowLogger.info({ user: ctx.from }, 'User requested help')

        // Get user access context
        const isAdmin = userManagementService.isAdmin(ctx.from)
        const isWhitelisted = await userManagementService.isWhitelisted(ctx.from)
        const userRoles = await roleService.getUserRoles(ctx.from)

        // Determine access level label
        let accessLevel = 'Public User'
        if (isAdmin) {
            accessLevel = 'Administrator'
        } else if (isWhitelisted) {
            accessLevel = 'Whitelisted User'
        }

        // Build help message with role header
        let helpMessage = `📚 **Help - Available Commands**\n\n`

        // USER ACCESS LEVEL HEADER
        helpMessage += `👤 **Your Access Level:**\n`
        helpMessage += `• Telegram ID: \`${ctx.from}\`\n`
        helpMessage += `• Status: **${accessLevel}**\n`
        if (userRoles.length > 0) {
            helpMessage += `• Roles: ${userRoles.map((r) => `\`${r}\``).join(', ')}\n`
        }
        helpMessage += `\n`

        // PUBLIC COMMANDS (everyone can access)
        helpMessage += `🌐 **General Commands**\n`
        helpMessage += `• \`/menu\` - Open interactive menu with buttons\n`
        helpMessage += `  Example: Type "menu" to see navigation options\n`
        helpMessage += `• \`/version\` - Show bot version and uptime\n`
        helpMessage += `  Example: Type "version" or "bot version"\n`
        helpMessage += `• \`/help\` - Show this help message\n`
        helpMessage += `• **Natural chat** - Chat with me naturally, I understand context!\n`
        helpMessage += `  Example: "Hello", "What can you do?", "Help me"\n`
        helpMessage += `\n`

        // ISP QUERIES (whitelisted or admin)
        if (isWhitelisted || isAdmin) {
            helpMessage += `🔍 **ISP Customer Queries**\n`
            helpMessage += `• \`check [phone/username]\` - Look up customer information\n`
            helpMessage += `  Example: "check +1234567890" or "check josianeyoussef"\n`
            helpMessage += `• \`lookup [username]\` - Find customer by username\n`
            helpMessage += `  Example: "lookup customer123"\n`
            helpMessage += `• **Natural language** - Ask questions naturally\n`
            helpMessage += `  Examples: "Is customer online?", "What's the IP for +123?"\n`
            helpMessage += `\n`
        }

        // LOCATION UPDATES (whitelisted or admin)
        if (isWhitelisted || isAdmin) {
            helpMessage += `📍 **Location Updates**\n`
            helpMessage += `• \`/setlocation\` or \`/coordinates\` - Update customer location\n`
            helpMessage += `  Supports: Manual coordinate entry or GPS location sharing\n`
            helpMessage += `  Example: Type "/setlocation" and follow the prompts\n`
            helpMessage += `\n`
        }

        // PRIVACY COMMANDS (everyone)
        helpMessage += `🗑️ **Privacy & Data**\n`
        helpMessage += `• \`/wipedata\` - Delete ALL your personal data (GDPR)\n`
        helpMessage += `  Warning: This action is permanent and irreversible\n`
        helpMessage += `  Example: Type "/wipedata" or "delete my data"\n`
        helpMessage += `\n`

        // ADMIN COMMANDS (admin only)
        if (isAdmin) {
            helpMessage += `🔧 **Admin - Whitelist Management**\n`
            helpMessage += `• \`whitelist\` - Add current group or user to whitelist\n`
            helpMessage += `  Example: Type "whitelist" in a group or with user\n`
            helpMessage += `• \`remove whitelist\` - Remove group/user from whitelist\n`
            helpMessage += `  Example: "remove whitelist" in target context\n`
            helpMessage += `• \`list whitelist\` - Show all whitelisted groups and users\n`
            helpMessage += `\n`

            helpMessage += `🔧 **Admin - Bot Management**\n`
            helpMessage += `• \`bot status\` - Show bot status, uptime, and feature flags\n`
            helpMessage += `• \`enable maintenance\` - Enable maintenance mode\n`
            helpMessage += `• \`disable maintenance\` - Disable maintenance mode\n`
            helpMessage += `• \`toggle ai\` - Toggle AI responses\n`
            helpMessage += `• \`toggle voice\` - Toggle voice transcription\n`
            helpMessage += `• \`toggle media\` - Toggle image analysis\n`
            helpMessage += `• \`toggle rag\` - Toggle RAG context memory\n`
            helpMessage += `• \`toggle isp\` - Toggle ISP tools\n`
            helpMessage += `\n`

            helpMessage += `🔧 **Admin - Role Management**\n`
            helpMessage += `• \`/set role <user_id> <role>\` - Assign role (replaces existing)\n`
            helpMessage += `  Example: "/set role 123456789 admin"\n`
            helpMessage += `• \`/add role <user_id> <role>\` - Add role (keeps existing)\n`
            helpMessage += `  Example: "/add role 123456789 collector"\n`
            helpMessage += `• \`/remove role <user_id> <role>\` - Remove specific role\n`
            helpMessage += `  Example: "/remove role 123456789 worker"\n`
            helpMessage += `• \`/show role <user_id>\` - Show user's roles and permissions\n`
            helpMessage += `  Example: "/show role 123456789"\n`
            helpMessage += `• \`/list roles\` - Show all role assignments\n`
            helpMessage += `• **Available roles:** admin, collector, worker\n`
            helpMessage += `\n`

            helpMessage += `🔧 **Admin - User Management**\n`
            helpMessage += `• \`/users\` - List all Telegram user mappings with roles\n`
            helpMessage += `  Shows: username, ID, @handle, name, roles, timestamps\n`
            helpMessage += `\n`
        }

        // ROLE-SPECIFIC INFO (collector/worker)
        if (userRoles.includes('collector') || userRoles.includes('worker')) {
            helpMessage += `👷 **Your Role Capabilities**\n`
            if (userRoles.includes('collector')) {
                helpMessage += `• **Collector** - Can update customer locations\n`
            }
            if (userRoles.includes('worker')) {
                helpMessage += `• **Worker** - Can update customer locations\n`
            }
            helpMessage += `• Use \`/setlocation\` to update single or multiple customers\n`
            helpMessage += `\n`
        }

        // MENU SYSTEM EXPLANATION
        helpMessage += `📱 **Menu System Navigation**\n`
        helpMessage += `• Type \`/menu\` to open the interactive button-based menu\n`
        helpMessage += `• **Submenus available:**\n`
        helpMessage += `  - User Info: Customer lookups and account queries\n`
        helpMessage += `  - Settings: Bot personality and configuration\n`
        helpMessage += `  - Help: Getting started guides and command reference\n`
        helpMessage += `  - Privacy: View or delete your personal data\n`
        helpMessage += `• Use buttons to navigate quickly without typing\n`
        helpMessage += `\n`

        // FOOTER WITH TIPS
        helpMessage += `💡 **Tips & Features**\n`
        helpMessage += `• **Voice notes** - Send voice messages, I'll transcribe them\n`
        helpMessage += `• **Images** - Send images, I can analyze them\n`
        helpMessage += `• **Natural language** - No need for exact commands, chat naturally!\n`
        helpMessage += `• **Context aware** - I remember our conversation\n`
        helpMessage += `\n`
        helpMessage += `_For detailed ISP query examples, use the Help menu in \`/menu\`_`

        await utils.flowDynamic(helpMessage)

        flowLogger.info(
            {
                user: ctx.from,
                isAdmin,
                isWhitelisted,
                roles: userRoles,
            },
            'Help message sent with role-based commands'
        )
    })
