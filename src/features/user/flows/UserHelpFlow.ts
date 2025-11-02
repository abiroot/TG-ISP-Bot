import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'

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

        // Determine access level label with priority: Admin > Role-based > Whitelisted > Public
        let accessLevel = 'Public User'
        if (isAdmin) {
            accessLevel = 'Administrator'
        } else if (userRoles.length > 0) {
            // User has database roles (admin, collector, worker)
            accessLevel = 'Role-Based User'
        } else if (isWhitelisted) {
            accessLevel = 'Whitelisted User'
        }

        // Build help message with role header
        let helpMessage = `📚 <b>Help - Available Commands</b>\n\n`

        // USER ACCESS LEVEL HEADER
        helpMessage += `👤 <b>Your Access Level:</b>\n`
        helpMessage += `• Telegram ID: <code>${html.escape(String(ctx.from))}</code>\n`
        helpMessage += `• Status: <b>${html.escape(accessLevel)}</b>\n`
        if (userRoles.length > 0) {
            helpMessage += `• Roles: ${userRoles.map((r) => `<code>${html.escape(r)}</code>`).join(', ')}\n`
        }
        helpMessage += `\n`

        // PUBLIC COMMANDS (everyone can access)
        helpMessage += `🌐 <b>General Commands</b>\n`
        helpMessage += `• <code>/menu</code> - Open interactive menu with buttons\n`
        helpMessage += `  Example: Type "menu" to see navigation options\n`
        helpMessage += `• <code>/version</code> - Show bot version and uptime\n`
        helpMessage += `  Example: Type "version" or "bot version"\n`
        helpMessage += `• <code>/help</code> - Show this help message\n`
        helpMessage += `• <code>/getmyid</code> or <code>/myid</code> - Get your Telegram ID\n`
        helpMessage += `  Use this for whitelisting or admin configuration\n`
        helpMessage += `• <b>Natural chat</b> - Chat with me naturally, I understand context!\n`
        helpMessage += `  Example: "Hello", "What can you do?", "Help me"\n`
        helpMessage += `\n`

        // ISP QUERIES (whitelisted or admin)
        if (isWhitelisted || isAdmin) {
            helpMessage += `🔍 <b>ISP Customer Queries</b>\n`
            helpMessage += `• <code>check [phone/username]</code> - Look up customer information\n`
            helpMessage += `  Example: "check +1234567890" or "check josianeyoussef"\n`
            helpMessage += `• <code>lookup [username]</code> - Find customer by username\n`
            helpMessage += `  Example: "lookup customer123"\n`
            helpMessage += `• <b>Natural language</b> - Ask questions naturally\n`
            helpMessage += `  Examples: "Is customer online?", "What's the IP for +123?"\n`
            helpMessage += `\n`
        }

        // LOCATION UPDATES (whitelisted or admin)
        if (isWhitelisted || isAdmin) {
            helpMessage += `📍 <b>Location Updates</b>\n`
            helpMessage += `• <code>/setlocation</code> or <code>/coordinates</code> - Update customer location\n`
            helpMessage += `  Supports: Manual coordinate entry or GPS location sharing\n`
            helpMessage += `  Example: Type "/setlocation" and follow the prompts\n`
            helpMessage += `\n`
        }

        // PRIVACY COMMANDS (everyone)
        helpMessage += `🗑️ <b>Privacy &amp; Data</b>\n`
        helpMessage += `• <code>/wipedata</code> - Delete ALL your personal data (GDPR)\n`
        helpMessage += `  Warning: This action is permanent and irreversible\n`
        helpMessage += `  Example: Type "/wipedata" or "delete my data"\n`
        helpMessage += `\n`

        // ADMIN COMMANDS (admin only)
        if (isAdmin) {
            helpMessage += `🔧 <b>Admin - Whitelist Management</b>\n`
            helpMessage += `• <code>whitelist</code> - Add current group or user to whitelist\n`
            helpMessage += `  Example: Type "whitelist" in a group or with user\n`
            helpMessage += `• <code>remove whitelist</code> - Remove group/user from whitelist\n`
            helpMessage += `  Example: "remove whitelist" in target context\n`
            helpMessage += `• <code>list whitelist</code> - Show all whitelisted groups and users\n`
            helpMessage += `\n`

            helpMessage += `🔧 <b>Admin - Bot Management</b>\n`
            helpMessage += `• <code>bot status</code> - Show bot status, uptime, and feature flags\n`
            helpMessage += `• <code>enable maintenance</code> - Enable maintenance mode\n`
            helpMessage += `• <code>disable maintenance</code> - Disable maintenance mode\n`
            helpMessage += `• <code>toggle ai</code> - Toggle AI responses\n`
            helpMessage += `• <code>toggle voice</code> - Toggle voice transcription\n`
            helpMessage += `• <code>toggle media</code> - Toggle image analysis\n`
            helpMessage += `• <code>toggle rag</code> - Toggle RAG context memory\n`
            helpMessage += `• <code>toggle isp</code> - Toggle ISP tools\n`
            helpMessage += `\n`

            helpMessage += `🔧 <b>Admin - Role Management</b>\n`
            helpMessage += `• <code>/set role &lt;user_id&gt; &lt;role&gt;</code> - Assign role (replaces existing)\n`
            helpMessage += `  Example: "/set role 123456789 admin"\n`
            helpMessage += `• <code>/add role &lt;user_id&gt; &lt;role&gt;</code> - Add role (keeps existing)\n`
            helpMessage += `  Example: "/add role 123456789 collector"\n`
            helpMessage += `• <code>/remove role &lt;user_id&gt; &lt;role&gt;</code> - Remove specific role\n`
            helpMessage += `  Example: "/remove role 123456789 worker"\n`
            helpMessage += `• <code>/show role &lt;user_id&gt;</code> - Show user's roles and permissions\n`
            helpMessage += `  Example: "/show role 123456789"\n`
            helpMessage += `• <code>/list roles</code> - Show all role assignments\n`
            helpMessage += `• <b>Available roles:</b> admin, collector, worker\n`
            helpMessage += `• <b>Tip:</b> Use <code>/users</code> to see all user IDs for role management\n`
            helpMessage += `\n`

            helpMessage += `🔧 <b>Admin - User Management</b>\n`
            helpMessage += `• <code>/users</code> - List all Telegram user mappings with roles\n`
            helpMessage += `  Shows: worker_username, Telegram ID, @handle, name, roles, timestamps\n`
            helpMessage += `  Use this to find user IDs for role management commands\n`
            helpMessage += `\n`
        }

        // ROLE-SPECIFIC INFO (collector/worker)
        if (userRoles.includes('collector') || userRoles.includes('worker')) {
            helpMessage += `👷 <b>Your Role Capabilities</b>\n`
            if (userRoles.includes('collector')) {
                helpMessage += `• <b>Collector</b> - Can update customer locations\n`
            }
            if (userRoles.includes('worker')) {
                helpMessage += `• <b>Worker</b> - Can update customer locations\n`
            }
            helpMessage += `• Use <code>/setlocation</code> to update single or multiple customers\n`
            helpMessage += `\n`
        }

        // MENU SYSTEM EXPLANATION
        helpMessage += `📱 <b>Menu System Navigation</b>\n`
        helpMessage += `• Type <code>/menu</code> to open the interactive button-based menu\n`
        helpMessage += `• <b>Submenus available:</b>\n`
        helpMessage += `  - User Info: Customer lookups and account queries\n`
        helpMessage += `  - Settings: Bot personality and configuration\n`
        helpMessage += `  - Help: Getting started guides and command reference\n`
        helpMessage += `  - Privacy: View or delete your personal data\n`
        helpMessage += `• Use buttons to navigate quickly without typing\n`
        helpMessage += `\n`

        // FOOTER WITH TIPS
        helpMessage += `💡 <b>Tips &amp; Features</b>\n`
        helpMessage += `• <b>Voice notes</b> - Send voice messages, I'll transcribe them\n`
        helpMessage += `• <b>Images</b> - Send images, I can analyze them\n`
        helpMessage += `• <b>Natural language</b> - No need for exact commands, chat naturally!\n`
        helpMessage += `• <b>Context aware</b> - I remember our conversation\n`
        helpMessage += `\n`
        helpMessage += `<i>For detailed ISP query examples, use the Help menu in <code>/menu</code></i>`

        // Send with HTML formatting via telegram API directly
        // Note: provider.sendMessage() doesn't forward parse_mode, so we use telegram API directly
        const provider = utils.provider as TelegramProvider
        await provider.vendor.telegram.sendMessage(ctx.from, helpMessage, { parse_mode: 'HTML' })

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
