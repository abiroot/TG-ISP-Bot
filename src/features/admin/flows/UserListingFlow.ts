import { addKeyword, EVENTS } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'

const userListLogger = createFlowLogger('UserListingFlow')

/**
 * User Listing Flow - Admin Command
 * Lists all telegram user mappings with detailed information including roles
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

        // Format output with detailed information
        let message = '👥 **Telegram User Mappings**\n\n'
        message += `Total Users: **${allUsers.length}**\n\n`

        if (allUsers.length === 0) {
            message += 'No users mapped yet.\n\n'
            message += '_Users are automatically captured when they interact with the bot._'
        } else {
            // Show first 20 users with detailed information
            const displayUsers = allUsers.slice(0, 20)

            for (const user of displayUsers) {
                // User header with mapped username
                message += `• **${user.username}**\n`

                // Telegram ID (code-formatted for easy copying)
                message += `  └ Telegram ID: \`${user.telegram_id}\`\n`

                // Telegram username (if available)
                if (user.telegram_username) {
                    message += `  └ Username: @${user.telegram_username}\n`
                }

                // Full name (if available)
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
                if (fullName) {
                    message += `  └ Name: ${fullName}\n`
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
                message += `_...and ${allUsers.length - 20} more users_\n\n`
            }
        }

        // Help footer
        message += '\n**Related Commands:**\n'
        message += '• `/list roles` - Show all role assignments\n'
        message += '• `/show role <user_id>` - Show specific user roles\n'
        message += '• `/list whitelist` - Show whitelisted users/groups'

        await flowDynamic(message)

        userListLogger.info({ from: ctx.from, userCount: allUsers.length }, 'User list sent successfully')
    } catch (error) {
        userListLogger.error({ err: error, from: ctx.from }, 'Failed to list telegram users')
        await flowDynamic(
            '❌ Failed to retrieve telegram user mappings. Please check the logs for details.'
        )
    }
})
