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
import { type RoleName } from '~/config/roles.js'
import { createFlowLogger } from '~/core/utils/logger'

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
    async (ctx, { flowDynamic, extensions }) => {
        const { userManagementService, roleService } = extensions!

        // Admin check
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Set role command received')

        // Parse command
        const parsed = parseRoleCommand(ctx.body)
        if (!parsed) {
            await flowDynamic(
                `❌ **Invalid command format**\n\nUsage: \`/set role <user_id> <role>\`\n\nExamples:\n- \`/set role 123456789 collector\`\n- \`/set role 987654321 worker\`\n- \`/set role @username admin\` (if username is numeric ID)\n\nValid roles: ${VALID_ROLES.join(', ')}`
            )
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
            await flowDynamic(
                `✅ **Role Assigned**\n\n**User ID:** \`${userId}\`\n**New Role:** ${role}\n\n${permissionSummary}`
            )
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
    async (ctx, { flowDynamic, extensions }) => {
        const { userManagementService, roleService } = extensions!

        // Admin check
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Add role command received')

        // Parse command
        const parsed = parseRoleCommand(ctx.body)
        if (!parsed) {
            await flowDynamic(
                `❌ **Invalid command format**\n\nUsage: \`/add role <user_id> <role>\`\n\nExamples:\n- \`/add role 123456789 collector\`\n- \`/add role 987654321 admin\`\n\nValid roles: ${VALID_ROLES.join(', ')}`
            )
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
            await flowDynamic(`✅ **Role Added**\n\n**User ID:** \`${userId}\`\n**Added Role:** ${role}\n\n${permissionSummary}`)
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
    async (ctx, { flowDynamic, extensions }) => {
        const { userManagementService, roleService } = extensions!

        // Admin check
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Remove role command received')

        // Parse command
        const parsed = parseRoleCommand(ctx.body)
        if (!parsed) {
            await flowDynamic(
                `❌ **Invalid command format**\n\nUsage: \`/remove role <user_id> <role>\`\n\nExamples:\n- \`/remove role 123456789 collector\`\n- \`/remove role 987654321 worker\`\n\nValid roles: ${VALID_ROLES.join(', ')}`
            )
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
            await flowDynamic(
                `✅ **Role Removed**\n\n**User ID:** \`${userId}\`\n**Removed Role:** ${role}\n\n${permissionSummary}`
            )
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
    async (ctx, { flowDynamic, extensions }) => {
        const { userManagementService, roleService } = extensions!

        // Admin check
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

        roleLogger.info({ from: ctx.from, message: ctx.body }, 'Show role command received')

        // Parse command
        const userId = parseShowRoleCommand(ctx.body)
        if (!userId) {
            await flowDynamic(
                `❌ **Invalid command format**\n\nUsage: \`/show role <user_id>\`\n\nExamples:\n- \`/show role 123456789\`\n- \`/show role 987654321\``
            )
            return
        }

        // Get user roles and permissions - Use database-backed RoleService
        const permissionSummary = await roleService.getUserPermissionSummary(userId)

        await flowDynamic(`**User ID:** \`${userId}\`\n\n${permissionSummary}`)
    }
)

/**
 * List Roles Flow - Show all role assignments
 *
 * Command: /list roles
 */
export const listRolesFlow = addKeyword(['/list roles', 'list roles']).addAction(
    async (ctx, { flowDynamic, extensions }) => {
        const { userManagementService, roleService } = extensions!

        // Admin check
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

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

        // Format output
        let message = '👥 **Role Assignments**\n\n'

        for (const role of VALID_ROLES) {
            const users = roleGroups[role] || []
            message += `**${role.toUpperCase()}** (${users.length} users)\n`

            if (users.length > 0) {
                users.forEach((userId) => {
                    message += `  • \`${userId}\`\n`
                })
            } else {
                message += `  (No users assigned)\n`
            }

            message += '\n'
        }

        message += `\n**Commands:**\n`
        message += `• \`/set role <user_id> <role>\` - Assign role\n`
        message += `• \`/add role <user_id> <role>\` - Add role (keep existing)\n`
        message += `• \`/remove role <user_id> <role>\` - Remove role\n`
        message += `• \`/show role <user_id>\` - Show user's roles\n`
        message += `\n**Valid roles:** ${VALID_ROLES.join(', ')}`

        await flowDynamic(message)
    }
)
