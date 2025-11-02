/**
 * Role Management Flow
 *
 * Admin-only commands for managing user roles and permissions.
 *
 * Commands:
 * - /set role <username> <role> - Assign role to user
 * - /show role <username> - Display user's roles
 * - /list roles - Show all role assignments
 * - /remove role <username> <role> - Remove role from user
 *
 * Available roles:
 * - admin: Full access to all tools + can manage roles
 * - collector: Can only update customer locations
 * - worker: Can only update customer locations
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { type RoleName } from '~/config/roles.js'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { runAdminMiddleware } from '~/core/middleware/adminMiddleware'

const roleLogger = createFlowLogger('role-management')

/**
 * Valid role names for validation
 */
const VALID_ROLES: RoleName[] = ['admin', 'collector', 'worker']

/**
 * Extract Telegram user ID from mention or raw ID
 *
 * Supports:
 * - @username
 * - numeric ID (123456789)
 * - username without @ (username)
 *
 * @param identifier - User mention or ID
 * @returns Telegram user ID or null if invalid
 */
function extractUserId(identifier: string): string | null {
    // Remove @ if present
    const cleaned = identifier.trim().replace(/^@/, '')

    // Check if it's a numeric ID
    if (/^\d+$/.test(cleaned)) {
        return cleaned
    }

    // For username, we need to lookup in USER_ROLES or return null
    // Since we're using IDs in USER_ROLES, usernames won't work directly
    return null
}

/**
 * Parse role command arguments
 *
 * Supports formats:
 * - /set role @username admin
 * - /set role 123456789 collector
 * - /remove role @username worker
 *
 * @param message - Full command message
 * @returns Parsed command object or null if invalid
 */
function parseRoleCommand(message: string): { userId: string; role: RoleName } | null {
    // Remove command prefix
    const cleaned = message
        .replace(/^\/(set|remove|add)\s+role\s+/i, '')
        .replace(/^(set|remove|add)\s+role\s+/i, '')
        .trim()

    // Split into parts
    const parts = cleaned.split(/\s+/)

    if (parts.length < 2) {
        return null
    }

    const [userIdentifier, roleName] = parts

    // Extract user ID
    const userId = extractUserId(userIdentifier)
    if (!userId) {
        return null
    }

    // Validate role
    const role = roleName.toLowerCase() as RoleName
    if (!VALID_ROLES.includes(role)) {
        return null
    }

    return { userId, role }
}

/**
 * Parse show role command
 *
 * Supports:
 * - /show role @username
 * - /show role 123456789
 *
 * @param message - Full command message
 * @returns User ID or null if invalid
 */
function parseShowRoleCommand(message: string): string | null {
    const cleaned = message.replace(/^\/show\s+role\s+/i, '').replace(/^show\s+role\s+/i, '').trim()

    const parts = cleaned.split(/\s+/)
    if (parts.length === 0) {
        return null
    }

    return extractUserId(parts[0])
}

/**
 * Set Role Flow - Assign role to user
 *
 * Command: /set role <username> <role>
 * Example: /set role @johndoe collector
 */
export const setRoleFlow = addKeyword(['/set role', 'set role']).addAction(
    async (ctx, utils) => {
        const { flowDynamic, extensions } = utils
        const { roleService } = extensions!

        // Admin check (centralized middleware)
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Set role command received')

        // Parse command
        const parsed = parseRoleCommand(ctx.body)
        if (!parsed) {
            const message =
                `❌ <b>Invalid command format</b>\n\n` +
                `<b>Usage:</b> <code>/set role &lt;user_id&gt; &lt;role&gt;</code>\n\n` +
                `<b>Examples:</b>\n` +
                `• <code>/set role 123456789 collector</code>\n` +
                `• <code>/set role 987654321 worker</code>\n\n` +
                `<b>Valid roles:</b> ${VALID_ROLES.join(', ')}\n\n` +
                `💡 <b>How to get user IDs:</b>\n` +
                `• Use <code>/users</code> to see all Telegram user IDs\n` +
                `• Ask users to use <code>/getmyid</code> to get their own ID`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
            return
        }

        const { userId, role } = parsed

        // Set role (replaces existing roles) - Use database-backed RoleService
        const setResult = await roleService.setUserRole(userId, [role], ctx.from)

        if (setResult.success) {
            roleLogger.info(
                {
                    adminId: ctx.from,
                    targetUserId: userId,
                    role,
                    action: 'set_role',
                },
                'Role assigned successfully'
            )

            const permissionSummary = await roleService.getUserPermissionSummary(userId)
            const message =
                `✅ <b>Role Assigned</b>\n\n` +
                `<b>User ID:</b> <code>${html.escape(userId)}</code>\n` +
                `<b>New Role:</b> ${html.escape(role)}\n\n` +
                `${permissionSummary}`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
        } else {
            roleLogger.error(
                {
                    adminId: ctx.from,
                    targetUserId: userId,
                    role,
                    error: setResult.message,
                },
                'Failed to assign role'
            )

            await flowDynamic(`❌ ${setResult.message}`)
        }
    }
)

/**
 * Add Role Flow - Add role to user (keeps existing roles)
 *
 * Command: /add role <username> <role>
 * Example: /add role @johndoe admin
 */
export const addRoleFlow = addKeyword(['/add role', 'add role']).addAction(
    async (ctx, utils) => {
        const { flowDynamic, extensions } = utils
        const { roleService } = extensions!

        // Admin check (centralized middleware)
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Add role command received')

        // Parse command
        const parsed = parseRoleCommand(ctx.body)
        if (!parsed) {
            const message =
                `❌ <b>Invalid command format</b>\n\n` +
                `<b>Usage:</b> <code>/add role &lt;user_id&gt; &lt;role&gt;</code>\n\n` +
                `<b>Examples:</b>\n` +
                `• <code>/add role 123456789 collector</code>\n` +
                `• <code>/add role 987654321 admin</code>\n\n` +
                `<b>Valid roles:</b> ${VALID_ROLES.join(', ')}\n\n` +
                `💡 <b>How to get user IDs:</b>\n` +
                `• Use <code>/users</code> to see all Telegram user IDs\n` +
                `• Ask users to use <code>/getmyid</code> to get their own ID`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
            return
        }

        const { userId, role } = parsed

        // Add role - Use database-backed RoleService
        const addResult = await roleService.addUserRole(userId, role, ctx.from)

        if (addResult.success) {
            roleLogger.info(
                {
                    adminId: ctx.from,
                    targetUserId: userId,
                    role,
                    action: 'add_role',
                },
                'Role added successfully'
            )

            const permissionSummary = await roleService.getUserPermissionSummary(userId)
            const message =
                `✅ <b>Role Added</b>\n\n` +
                `<b>User ID:</b> <code>${html.escape(userId)}</code>\n` +
                `<b>Added Role:</b> ${html.escape(role)}\n\n` +
                `${permissionSummary}`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
        } else {
            await flowDynamic(`❌ ${addResult.message}`)
        }
    }
)

/**
 * Remove Role Flow - Remove specific role from user
 *
 * Command: /remove role <username> <role>
 * Example: /remove role @johndoe collector
 */
export const removeRoleFlow = addKeyword(['/remove role', 'remove role']).addAction(
    async (ctx, utils) => {
        const { flowDynamic, extensions } = utils
        const { roleService } = extensions!

        // Admin check (centralized middleware)
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Remove role command received')

        // Parse command
        const parsed = parseRoleCommand(ctx.body)
        if (!parsed) {
            const message =
                `❌ <b>Invalid command format</b>\n\n` +
                `<b>Usage:</b> <code>/remove role &lt;user_id&gt; &lt;role&gt;</code>\n\n` +
                `<b>Examples:</b>\n` +
                `• <code>/remove role 123456789 collector</code>\n` +
                `• <code>/remove role 987654321 worker</code>\n\n` +
                `<b>Valid roles:</b> ${VALID_ROLES.join(', ')}\n\n` +
                `💡 <b>How to get user IDs:</b>\n` +
                `• Use <code>/users</code> to see all Telegram user IDs\n` +
                `• Ask users to use <code>/getmyid</code> to get their own ID`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
            return
        }

        const { userId, role } = parsed

        // Remove role - Use database-backed RoleService
        const removeResult = await roleService.removeUserRole(userId, role, ctx.from)

        if (removeResult.success) {
            roleLogger.info(
                {
                    adminId: ctx.from,
                    targetUserId: userId,
                    role,
                    action: 'remove_role',
                },
                'Role removed successfully'
            )

            const permissionSummary = await roleService.getUserPermissionSummary(userId)
            const message =
                `✅ <b>Role Removed</b>\n\n` +
                `<b>User ID:</b> <code>${html.escape(userId)}</code>\n` +
                `<b>Removed Role:</b> ${html.escape(role)}\n\n` +
                `${permissionSummary}`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
        } else {
            await flowDynamic(`❌ ${removeResult.message}`)
        }
    }
)

/**
 * Show Role Flow - Display user's current roles and permissions
 *
 * Command: /show role <username>
 * Example: /show role @johndoe
 */
export const showRoleFlow = addKeyword(['/show role', 'show role']).addAction(
    async (ctx, utils) => {
        const { flowDynamic, extensions } = utils
        const { roleService } = extensions!

        // Admin check (centralized middleware)
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Show role command received')

        // Parse command
        const userId = parseShowRoleCommand(ctx.body)
        if (!userId) {
            const message =
                `❌ <b>Invalid command format</b>\n\n` +
                `<b>Usage:</b> <code>/show role &lt;user_id&gt;</code>\n\n` +
                `<b>Examples:</b>\n` +
                `• <code>/show role 123456789</code>\n` +
                `• <code>/show role 987654321</code>\n\n` +
                `💡 <b>How to get user IDs:</b>\n` +
                `• Use <code>/users</code> to see all Telegram user IDs\n` +
                `• Ask users to use <code>/getmyid</code> to get their own ID`

            const provider = utils.provider as TelegramProvider
            await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
            return
        }

        // Get user roles and permissions - Use database-backed RoleService
        const permissionSummary = await roleService.getUserPermissionSummary(userId)

        const message = `<b>User ID:</b> <code>${html.escape(userId)}</code>\n\n${permissionSummary}`

        const provider = utils.provider as TelegramProvider
        await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
    }
)

/**
 * List Roles Flow - Show all role assignments
 *
 * Command: /list roles
 */
export const listRolesFlow = addKeyword(['/list roles', 'list roles']).addAction(
    async (ctx, utils) => {
        const { flowDynamic, extensions } = utils
        const { roleService } = extensions!

        // Admin check (centralized middleware)
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        roleLogger.info({ from: ctx.from }, 'List roles command received')

        // Get all role assignments from database
        const allAssignments: Record<string, RoleName[]> = await roleService.getAllRoleAssignments()

        // Group users by role
        const roleGroups: Record<string, string[]> = {}

        for (const [userId, roles] of Object.entries(allAssignments)) {
            for (const role of roles) {
                if (!roleGroups[role]) {
                    roleGroups[role] = []
                }
                roleGroups[role].push(userId)
            }
        }

        // Format output with HTML
        let message = '<b>👥 Role Assignments</b>\n\n'

        for (const role of VALID_ROLES) {
            const users = roleGroups[role] || []
            message += `<b>${role.toUpperCase()}</b> (${users.length} users)\n`

            if (users.length > 0) {
                users.forEach((userId) => {
                    message += `  • <code>${html.escape(userId)}</code>\n`
                })
            } else {
                message += `  <i>(No users assigned)</i>\n`
            }

            message += '\n'
        }

        message += `\n<b>Commands:</b>\n`
        message += `• <code>/set role &lt;user_id&gt; &lt;role&gt;</code> - Assign role\n`
        message += `• <code>/add role &lt;user_id&gt; &lt;role&gt;</code> - Add role (keep existing)\n`
        message += `• <code>/remove role &lt;user_id&gt; &lt;role&gt;</code> - Remove role\n`
        message += `• <code>/show role &lt;user_id&gt;</code> - Show user's roles\n`
        message += `\n<b>Valid roles:</b> ${VALID_ROLES.join(', ')}`

        // Send with HTML formatting via telegram API directly
        const provider = utils.provider as TelegramProvider
        await provider.vendor.telegram.sendMessage(ctx.from, message, { parse_mode: 'HTML' })
    }
)
