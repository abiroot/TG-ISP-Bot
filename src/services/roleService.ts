/**
 * Role Service
 *
 * Business logic layer for role-based access control (RBAC)
 * Wraps UserRoleRepository with permission checking and auto-migration
 */

import { UserRoleRepository } from '~/database/repositories/userRoleRepository.js'
import { TOOL_PERMISSIONS, type RoleName, type ToolName, USER_ROLES } from '~/config/roles.js'
import { createFlowLogger } from '~/core/utils/logger.js'
import type { CreateUserRoleInput } from '~/database/schemas/userRole.js'

const roleLogger = createFlowLogger('role-service')

export class RoleService {
    private repository: UserRoleRepository
    private migrated: boolean = false

    constructor() {
        this.repository = new UserRoleRepository()
    }

    /**
     * Auto-migrate roles from config to database (one-time on startup)
     *
     * Reads USER_ROLES from src/config/roles.ts and inserts into database
     * Only runs once (skipped if roles already exist in database)
     */
    async autoMigrateConfigRoles(): Promise<void> {
        if (this.migrated) {
            roleLogger.debug('Auto-migration already completed this session')
            return
        }

        try {
            // Check if database already has roles
            const existingRoles = await this.repository.getAllRoles()
            if (existingRoles.length > 0) {
                roleLogger.info(
                    { roleCount: existingRoles.length },
                    'Database already has roles, skipping auto-migration'
                )
                this.migrated = true
                return
            }

            // Prepare roles for bulk insert
            const rolesToMigrate: CreateUserRoleInput[] = []

            for (const [userId, roles] of Object.entries(USER_ROLES)) {
                for (const role of roles) {
                    rolesToMigrate.push({
                        user_telegram_id: userId,
                        role,
                        assigned_by: 'system',
                        notes: 'Auto-migrated from config on startup',
                    })
                }
            }

            if (rolesToMigrate.length === 0) {
                roleLogger.info('No roles in config to migrate')
                this.migrated = true
                return
            }

            // Bulk insert roles
            const inserted = await this.repository.bulkInsertRoles(rolesToMigrate)

            roleLogger.info(
                {
                    totalRoles: rolesToMigrate.length,
                    inserted,
                    users: Object.keys(USER_ROLES).length,
                },
                '✅ Auto-migrated config roles to database'
            )

            this.migrated = true
        } catch (error) {
            roleLogger.error({ error }, '❌ Failed to auto-migrate config roles')
            throw error
        }
    }

    /**
     * Get all active roles for a user
     *
     * @param userTelegramId - Telegram numeric user ID
     * @returns Array of role names
     */
    async getUserRoles(userTelegramId: string): Promise<RoleName[]> {
        return await this.repository.getUserRoles(userTelegramId)
    }

    /**
     * Check if user has permission to execute a tool
     *
     * @param userTelegramId - Telegram numeric user ID
     * @param toolName - Name of the ISP tool
     * @returns true if user has permission, false otherwise
     */
    async hasToolPermission(userTelegramId: string, toolName: ToolName): Promise<boolean> {
        const userRoles = await this.getUserRoles(userTelegramId)
        const allowedRoles = TOOL_PERMISSIONS[toolName] || []

        // Check if any of the user's roles are allowed for this tool
        return userRoles.some((role) => allowedRoles.includes(role))
    }

    /**
     * Get formatted permission summary for a user
     *
     * @param userTelegramId - Telegram user ID
     * @returns Human-readable permission summary
     */
    async getUserPermissionSummary(userTelegramId: string): Promise<string> {
        const roles = await this.getUserRoles(userTelegramId)

        if (roles.length === 0) {
            return '❌ No roles assigned (no tool access)'
        }

        const permissions: string[] = []

        // Check each tool
        const tools: ToolName[] = [
            'searchCustomer',
            'getMikrotikUsers',
            'updateUserLocation',
            'batchUpdateLocations',
        ]

        for (const tool of tools) {
            const hasPermission = await this.hasToolPermission(userTelegramId, tool)
            permissions.push(`${hasPermission ? '✅' : '❌'} ${tool}`)
        }

        return `
👤 **Roles:** ${roles.join(', ')}

**Tool Permissions:**
${permissions.join('\n')}
        `.trim()
    }

    /**
     * Set user roles (replaces existing roles)
     *
     * @param userTelegramId - Telegram numeric user ID
     * @param roles - Array of roles to assign
     * @param setBy - Admin ID who made the change
     * @returns Object with success status and message
     */
    async setUserRole(
        userTelegramId: string,
        roles: RoleName[],
        setBy: string
    ): Promise<{ success: boolean; message: string }> {
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

            // Remove all existing roles first
            await this.repository.removeAllRoles(userTelegramId, setBy)

            // Add new roles
            for (const role of roles) {
                await this.repository.addRole({
                    user_telegram_id: userTelegramId,
                    role,
                    assigned_by: setBy,
                })
            }

            roleLogger.info(
                {
                    userTelegramId,
                    roles,
                    setBy,
                },
                'User roles updated (replaced)'
            )

            return {
                success: true,
                message: `User roles updated successfully to: ${roles.join(', ')}`,
            }
        } catch (error) {
            roleLogger.error({ error, userTelegramId, roles }, 'Failed to set user roles')
            return {
                success: false,
                message: 'Failed to update user roles',
            }
        }
    }

    /**
     * Add a role to a user (keeps existing roles)
     *
     * @param userTelegramId - Telegram numeric user ID
     * @param role - Role to add
     * @param setBy - Admin ID who made the change
     * @returns Object with success status and message
     */
    async addUserRole(
        userTelegramId: string,
        role: RoleName,
        setBy: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            const currentRoles = await this.getUserRoles(userTelegramId)

            // Check if role already exists
            if (currentRoles.includes(role)) {
                return {
                    success: false,
                    message: `User already has role: ${role}`,
                }
            }

            // Add new role
            await this.repository.addRole({
                user_telegram_id: userTelegramId,
                role,
                assigned_by: setBy,
            })

            roleLogger.info(
                {
                    userTelegramId,
                    role,
                    setBy,
                },
                'User role added'
            )

            return {
                success: true,
                message: `Role "${role}" added successfully`,
            }
        } catch (error) {
            roleLogger.error({ error, userTelegramId, role }, 'Failed to add user role')
            return {
                success: false,
                message: 'Failed to add user role',
            }
        }
    }

    /**
     * Remove a role from a user
     *
     * @param userTelegramId - Telegram numeric user ID
     * @param role - Role to remove
     * @param setBy - Admin ID who made the change
     * @returns Object with success status and message
     */
    async removeUserRole(
        userTelegramId: string,
        role: RoleName,
        setBy: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            const currentRoles = await this.getUserRoles(userTelegramId)

            // Check if role exists
            if (!currentRoles.includes(role)) {
                return {
                    success: false,
                    message: `User does not have role: ${role}`,
                }
            }

            // Remove role
            const removed = await this.repository.removeRole({
                user_telegram_id: userTelegramId,
                role,
                revoked_by: setBy,
            })

            if (!removed) {
                return {
                    success: false,
                    message: 'Failed to remove role',
                }
            }

            roleLogger.info(
                {
                    userTelegramId,
                    role,
                    setBy,
                },
                'User role removed'
            )

            return {
                success: true,
                message: `Role "${role}" removed successfully`,
            }
        } catch (error) {
            roleLogger.error({ error, userTelegramId, role }, 'Failed to remove user role')
            return {
                success: false,
                message: 'Failed to remove user role',
            }
        }
    }

    /**
     * Get all users with a specific role
     *
     * @param role - Role name to search for
     * @returns Array of user IDs with that role
     */
    async getUsersByRole(role: RoleName): Promise<string[]> {
        return await this.repository.getUsersByRole(role)
    }

    /**
     * Get all role assignments
     *
     * @returns Map of user IDs to their roles
     */
    async getAllRoleAssignments(): Promise<Record<string, RoleName[]>> {
        const allRoles = await this.repository.getAllRoles()

        const assignments: Record<string, RoleName[]> = {}

        for (const roleRecord of allRoles) {
            if (!assignments[roleRecord.user_telegram_id]) {
                assignments[roleRecord.user_telegram_id] = []
            }
            assignments[roleRecord.user_telegram_id].push(roleRecord.role)
        }

        return assignments
    }
}
