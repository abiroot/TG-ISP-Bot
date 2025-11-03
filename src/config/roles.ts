/**
 * Role-Based Access Control (RBAC) Configuration
 *
 * This module defines role types and tool permission matrix for the ISP bot.
 *
 * ROLES:
 * - admin: Full access to all tools + can manage user roles
 * - collector: Can only update customer locations
 * - worker: Can only update customer locations
 *
 * ARCHITECTURE:
 * - Role assignments: Stored in database (user_roles table) - persistent across restarts
 * - Tool permissions: Defined in this config file (TOOL_PERMISSIONS matrix)
 * - Role management: Use RoleService for all role operations
 *
 * AUTO-MIGRATION:
 * - USER_ROLES below is used ONLY for auto-migration on first startup
 * - After migration, all role assignments are managed via database
 * - Use /set role, /add role, /remove role commands to manage roles
 *
 * @deprecated USER_ROLES - Use RoleService for runtime role management
 */

import { ADMIN_IDS } from './admins.js'

/**
 * Valid role names in the system
 */
export type RoleName = 'admin' | 'collector' | 'worker'

/**
 * Valid ISP tool names
 */
export type ToolName =
    | 'searchCustomer'
    | 'getMikrotikUsers'
    | 'updateUserLocation'
    | 'batchUpdateLocations'

/**
 * User role assignments (Telegram ID → roles array)
 *
 * **⚠️ DEPRECATED - For auto-migration only!**
 *
 * This object is used ONLY on first startup to auto-migrate roles to database.
 * After migration, all role assignments are stored in the `user_roles` table.
 *
 * To manage roles in production:
 * - Use RoleService methods: `addUserRole()`, `removeUserRole()`, `setUserRole()`
 * - Use bot commands: `/set role`, `/add role`, `/remove role`
 *
 * Format: { 'telegram_id': ['role1', 'role2'] }
 *
 * IMPORTANT: Use numeric Telegram IDs, not usernames
 * - Numeric IDs are permanent and secure
 * - Get IDs from messages table or telegram_user_mapping table
 *
 * Auto-migrated admins from ADMIN_IDS:
 * - '5795384135' (Jhonny Hachem)
 * - '341628148' (Lamba)
 *
 * @deprecated Use RoleService for runtime role management
 */
export const USER_ROLES: Record<string, RoleName[]> = {
    // Auto-migrate existing admins
    ...ADMIN_IDS.reduce(
        (acc, adminId) => {
            acc[adminId] = ['admin']
            return acc
        },
        {} as Record<string, RoleName[]>,
    ),

    // Example role assignments (replace with your actual users):
    // '123456789': ['collector'],  // Money collector user
    // '987654321': ['worker'],     // Field worker user
}

/**
 * Tool permission matrix (tool → allowed roles)
 *
 * Defines which roles can execute which ISP tools.
 *
 * TOOL CATEGORIES:
 * - Read-only: searchCustomer, getMikrotikUsers
 * - Write: updateUserLocation, batchUpdateLocations
 *
 * NOTES:
 * - Workers can execute searchCustomer but see simplified format
 * - Admins see complete information with all fields
 */
export const TOOL_PERMISSIONS: Record<ToolName, RoleName[]> = {
    // Read-only tools - workers can query customers with simplified format
    searchCustomer: ['admin', 'worker'],
    getMikrotikUsers: ['admin'],
    // Write tools - all roles can update locations
    updateUserLocation: ['admin', 'collector', 'worker'],
    batchUpdateLocations: ['admin', 'collector', 'worker'],
}

/**
 * Check if a user has permission to execute a tool
 *
 * **⚠️ DEPRECATED - Use RoleService.hasToolPermission() instead**
 *
 * This function uses in-memory USER_ROLES which is only for migration.
 * Use RoleService for database-backed permission checks.
 *
 * @param userId - Telegram user ID (numeric string)
 * @param toolName - Name of the ISP tool
 * @returns true if user has permission, false otherwise
 *
 * @deprecated Use RoleService.hasToolPermission() for database-backed checks
 *
 * @example
 * // OLD (deprecated):
 * if (hasToolPermission('123456789', 'updateUserLocation')) { }
 *
 * // NEW (use this):
 * if (await roleService.hasToolPermission('123456789', 'updateUserLocation')) { }
 */
export function hasToolPermission(userId: string, toolName: ToolName): boolean {
    const userRoles = USER_ROLES[userId] || []
    const allowedRoles = TOOL_PERMISSIONS[toolName] || []

    // Check if any of the user's roles are allowed for this tool
    return userRoles.some((role) => allowedRoles.includes(role))
}

/**
 * Get all roles assigned to a user
 *
 * @param userId - Telegram user ID (numeric string)
 * @returns Array of role names
 *
 * @example
 * const roles = getUserRoles('123456789')
 * console.log(roles) // ['admin', 'collector']
 */
export function getUserRoles(userId: string): RoleName[] {
    return USER_ROLES[userId] || []
}

/**
 * Check if a user has a specific role
 *
 * @param userId - Telegram user ID (numeric string)
 * @param role - Role name to check
 * @returns true if user has the role, false otherwise
 */
export function hasRole(userId: string, role: RoleName): boolean {
    const userRoles = USER_ROLES[userId] || []
    return userRoles.includes(role)
}

/**
 * Set a user's roles (replaces existing roles)
 *
 * IMPORTANT: This is an in-memory operation only!
 * - Changes are NOT persisted to database
 * - Changes are lost on bot restart
 * - For production, consider database-backed RBAC
 *
 * @param userId - Telegram user ID (numeric string)
 * @param roles - Array of roles to assign
 * @param setBy - Admin ID who made the change (for audit)
 * @returns Object with success status and message
 *
 * @example
 * const result = setUserRole('123456789', ['collector'], '341628148')
 */
export function setUserRole(
    userId: string,
    roles: RoleName[],
    setBy: string,
): { success: boolean; message: string } {
    try {
        // Validate roles
        const validRoles: RoleName[] = ['admin', 'collector', 'worker']
        const invalidRoles = roles.filter((role) => !validRoles.includes(role))

        if (invalidRoles.length > 0) {
            return {
                success: false,
                message: `Invalid role(s): ${invalidRoles.join(', ')}. Valid roles: ${validRoles.join(', ')}`,
            }
        }

        // Update roles
        USER_ROLES[userId] = roles

        console.log(`[RBAC] User ${userId} roles updated to [${roles.join(', ')}] by admin ${setBy}`)

        return {
            success: true,
            message: `User roles updated successfully to: ${roles.join(', ')}`,
        }
    } catch (error) {
        console.error('[RBAC] Error setting user role:', error)
        return {
            success: false,
            message: 'Failed to update user roles',
        }
    }
}

/**
 * Add a role to a user (keeps existing roles)
 *
 * @param userId - Telegram user ID (numeric string)
 * @param role - Role to add
 * @param setBy - Admin ID who made the change
 * @returns Object with success status and message
 */
export function addUserRole(
    userId: string,
    role: RoleName,
    setBy: string,
): { success: boolean; message: string } {
    const currentRoles = getUserRoles(userId)

    // Check if role already exists
    if (currentRoles.includes(role)) {
        return {
            success: false,
            message: `User already has role: ${role}`,
        }
    }

    // Add new role
    const newRoles = [...currentRoles, role]
    return setUserRole(userId, newRoles, setBy)
}

/**
 * Remove a role from a user
 *
 * @param userId - Telegram user ID (numeric string)
 * @param role - Role to remove
 * @param setBy - Admin ID who made the change
 * @returns Object with success status and message
 */
export function removeUserRole(
    userId: string,
    role: RoleName,
    setBy: string,
): { success: boolean; message: string } {
    const currentRoles = getUserRoles(userId)

    // Check if role exists
    if (!currentRoles.includes(role)) {
        return {
            success: false,
            message: `User does not have role: ${role}`,
        }
    }

    // Remove role
    const newRoles = currentRoles.filter((r) => r !== role)
    return setUserRole(userId, newRoles, setBy)
}

/**
 * Get all users with a specific role
 *
 * @param role - Role name to search for
 * @returns Array of user IDs with that role
 */
export function getUsersByRole(role: RoleName): string[] {
    return Object.entries(USER_ROLES)
        .filter(([_, roles]) => roles.includes(role))
        .map(([userId]) => userId)
}

/**
 * Get formatted string of user's permissions
 *
 * @param userId - Telegram user ID
 * @returns Human-readable permission summary
 */
export function getUserPermissionSummary(userId: string): string {
    const roles = getUserRoles(userId)

    if (roles.length === 0) {
        return '❌ No roles assigned (no tool access)'
    }

    const permissions: string[] = []

    // Check each tool
    const tools: ToolName[] = ['searchCustomer', 'getMikrotikUsers', 'updateUserLocation', 'batchUpdateLocations']

    tools.forEach((tool) => {
        if (hasToolPermission(userId, tool)) {
            permissions.push(`✅ ${tool}`)
        } else {
            permissions.push(`❌ ${tool}`)
        }
    })

    return `
👤 **Roles:** ${roles.join(', ')}

**Tool Permissions:**
${permissions.join('\n')}
    `.trim()
}
