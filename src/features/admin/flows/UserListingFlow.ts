import { addKeyword, EVENTS } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'

const userListLogger = createFlowLogger('UserListingFlow')

/**
 * User Listing Flow - Admin Command
 * Lists all telegram user mappings with detailed information including roles
 *
 * Displays worker_username (billing system mapping) and Telegram user data
 *
 * Command: /users or users
 */
export const userListingFlow = addKeyword<TelegramProvider, Database>([
    '/users',
    'users',
]).addAction(async (ctx, { flowDynamic, extensions }) => {
    const { userManagementService, telegramUserService, roleService } = extensions!

    // Admin check
    if (!userManagementService.isAdmin(ctx.from)) {
        await flowDynamic('⚠️ This command is only available to administrators.')
        return
    }

    userListLogger.info({ from: ctx.from }, 'List telegram users command received')

    try {
        // Fetch all telegram user mappings
        const allUsers = await telegramUserService.getAllUsers()

        // Fetch all role assignments
        const roleAssignments = await roleService.getAllRoleAssignments()

        // Format output with HTML formatting
        let message = '<b>👥 Telegram User Mappings</b>\n\n'
        message += `<b>Total Users:</b> ${allUsers.length}\n\n`

        if (allUsers.length === 0) {
            message += 'No users mapped yet.\n\n'
            message += '<i>Users are automatically captured when they interact with the bot.</i>'
        } else {
            // Show first 20 users with detailed information
            const displayUsers = allUsers.slice(0, 20)

            for (const user of displayUsers) {
                // User header with worker username from billing system
                message += `• <b>${html.escape(user.worker_username)}</b>\n`

                // Telegram ID (code-formatted for easy copying)
                message += `  └ Telegram ID: <code>${html.escape(user.telegram_id)}</code>\n`

                // Telegram handle @username (if available)
                if (user.telegram_handle) {
                    message += `  └ Handle: @${html.escape(user.telegram_handle)}\n`
                }

                // Full name (if available)
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
                if (fullName) {
                    message += `  └ Name: ${html.escape(fullName)}\n`
                }

                // Roles (cross-referenced from user_roles table)
                const userRoles = roleAssignments[user.telegram_id] || []
                if (userRoles.length > 0) {
                    message += `  └ Roles: ${userRoles.join(', ')}\n`
                }

                // Timestamps (detailed format)
                const createdAt = new Date(user.created_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                })
                message += `  └ Created: ${createdAt}\n`

                const updatedAt = new Date(user.updated_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                })
                message += `  └ Updated: ${updatedAt}\n`

                message += '\n'
            }

            // Pagination notice if there are more users
            if (allUsers.length > 20) {
                message += `<i>...and ${allUsers.length - 20} more users</i>\n\n`
            }
        }

        // Help footer
        message += '\n<b>Related Commands:</b>\n'
        message += '• <code>/list roles</code> - Show all role assignments\n'
        message += '• <code>/show role &lt;user_id&gt;</code> - Show specific user roles\n'
        message += '• <code>/list whitelist</code> - Show whitelisted users/groups\n'
        message += '• <code>/getmyid</code> - Get your own Telegram ID'

        // Send with HTML formatting via telegram API directly
        const provider = ctx.provider as TelegramProvider
        await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })

        userListLogger.info({ from: ctx.from, userCount: allUsers.length }, 'User list sent successfully')
    } catch (error) {
        userListLogger.error({ err: error, from: ctx.from }, 'Failed to list telegram users')
        await flowDynamic(
            '❌ Failed to retrieve telegram user mappings. Please check the logs for details.'
        )
    }
})
