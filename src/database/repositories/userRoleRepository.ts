/**
 * User Role Repository
 *
 * Data access layer for user_roles table
 * Handles all database operations for role-based access control
 */

import { pool } from '~/config/database.js'
import type { UserRole, CreateUserRoleInput, RevokeUserRoleInput, UserRoleSummary } from '../schemas/userRole.js'
import type { RoleName } from '~/config/roles.js'

export class UserRoleRepository {
    /**
     * Get all active roles for a user
     *
     * @param userTelegramId - Telegram numeric user ID
     * @returns Array of active role names
     */
    async getUserRoles(userTelegramId: string): Promise<RoleName[]> {
        const result = await pool.query<{ role: RoleName }>(
            `SELECT role
             FROM user_roles
             WHERE user_telegram_id = $1 AND is_active = TRUE
             ORDER BY assigned_at ASC`,
            [userTelegramId]
        )
        return result.rows.map((row) => row.role)
    }

    /**
     * Check if user has a specific role
     *
     * @param userTelegramId - Telegram numeric user ID
     * @param role - Role name to check
     * @returns true if user has the role, false otherwise
     */
    async hasRole(userTelegramId: string, role: RoleName): Promise<boolean> {
        const result = await pool.query(
            `SELECT EXISTS(
                SELECT 1 FROM user_roles
                WHERE user_telegram_id = $1
                AND role = $2
                AND is_active = TRUE
            )`,
            [userTelegramId, role]
        )
        return result.rows[0].exists
    }

    /**
     * Add a role to a user
     *
     * Uses ON CONFLICT to reactivate soft-deleted roles
     *
     * @param data - Role assignment data
     * @returns Created/reactivated role record
     */
    async addRole(data: CreateUserRoleInput): Promise<UserRole> {
        const result = await pool.query<UserRole>(
            `INSERT INTO user_roles (user_telegram_id, role, assigned_by, notes)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_telegram_id, role)
             DO UPDATE SET
                is_active = TRUE,
                assigned_by = EXCLUDED.assigned_by,
                assigned_at = NOW(),
                notes = EXCLUDED.notes,
                revoked_by = NULL,
                revoked_at = NULL,
                updated_at = NOW()
             RETURNING *`,
            [data.user_telegram_id, data.role, data.assigned_by, data.notes || null]
        )
        return result.rows[0]
    }

    /**
     * Remove a role from a user (soft delete)
     *
     * @param data - Role revocation data
     * @returns true if role was revoked, false if not found
     */
    async removeRole(data: RevokeUserRoleInput): Promise<boolean> {
        const result = await pool.query(
            `UPDATE user_roles
             SET is_active = FALSE,
                 revoked_by = $3,
                 revoked_at = NOW(),
                 updated_at = NOW()
             WHERE user_telegram_id = $1
             AND role = $2
             AND is_active = TRUE`,
            [data.user_telegram_id, data.role, data.revoked_by]
        )
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Get all role assignments (active only)
     *
     * @returns Array of all active role records
     */
    async getAllRoles(): Promise<UserRole[]> {
        const result = await pool.query<UserRole>(
            `SELECT *
             FROM user_roles
             WHERE is_active = TRUE
             ORDER BY user_telegram_id, role`
        )
        return result.rows
    }

    /**
     * Get all users with a specific role
     *
     * @param role - Role name to filter by
     * @returns Array of user Telegram IDs
     */
    async getUsersByRole(role: RoleName): Promise<string[]> {
        const result = await pool.query<{ user_telegram_id: string }>(
            `SELECT DISTINCT user_telegram_id
             FROM user_roles
             WHERE role = $1 AND is_active = TRUE
             ORDER BY user_telegram_id`,
            [role]
        )
        return result.rows.map((row) => row.user_telegram_id)
    }

    /**
     * Get role summary for a user
     *
     * @param userTelegramId - Telegram numeric user ID
     * @returns Role summary with metadata
     */
    async getUserRoleSummary(userTelegramId: string): Promise<UserRoleSummary> {
        const rolesResult = await pool.query<{ role: RoleName }>(
            `SELECT role
             FROM user_roles
             WHERE user_telegram_id = $1 AND is_active = TRUE
             ORDER BY role`,
            [userTelegramId]
        )

        const metadataResult = await pool.query<{
            first_assigned_at: Date | null
            last_assigned_at: Date | null
        }>(
            `SELECT
                MIN(assigned_at) as first_assigned_at,
                MAX(assigned_at) as last_assigned_at
             FROM user_roles
             WHERE user_telegram_id = $1 AND is_active = TRUE`,
            [userTelegramId]
        )

        const roles = rolesResult.rows.map((row) => row.role)
        const metadata = metadataResult.rows[0] || {
            first_assigned_at: null,
            last_assigned_at: null,
        }

        return {
            user_telegram_id: userTelegramId,
            roles,
            role_count: roles.length,
            first_assigned_at: metadata.first_assigned_at,
            last_assigned_at: metadata.last_assigned_at,
        }
    }

    /**
     * Remove all roles from a user (soft delete)
     *
     * @param userTelegramId - Telegram numeric user ID
     * @param revokedBy - Telegram ID of admin revoking roles
     * @returns Number of roles revoked
     */
    async removeAllRoles(userTelegramId: string, revokedBy: string): Promise<number> {
        const result = await pool.query(
            `UPDATE user_roles
             SET is_active = FALSE,
                 revoked_by = $2,
                 revoked_at = NOW(),
                 updated_at = NOW()
             WHERE user_telegram_id = $1
             AND is_active = TRUE`,
            [userTelegramId, revokedBy]
        )
        return result.rowCount || 0
    }

    /**
     * Get audit trail for a user (all role changes)
     *
     * @param userTelegramId - Telegram numeric user ID
     * @returns Array of all role records (active and revoked)
     */
    async getAuditTrail(userTelegramId: string): Promise<UserRole[]> {
        const result = await pool.query<UserRole>(
            `SELECT *
             FROM user_roles
             WHERE user_telegram_id = $1
             ORDER BY assigned_at DESC`,
            [userTelegramId]
        )
        return result.rows
    }

    /**
     * Bulk insert roles (for migration)
     *
     * @param roles - Array of role assignments
     * @returns Number of roles inserted
     */
    async bulkInsertRoles(roles: CreateUserRoleInput[]): Promise<number> {
        if (roles.length === 0) return 0

        // Build values array for bulk insert
        const values: any[] = []
        const placeholders: string[] = []

        roles.forEach((role, index) => {
            const offset = index * 4
            placeholders.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
            )
            values.push(
                role.user_telegram_id,
                role.role,
                role.assigned_by,
                role.notes || null
            )
        })

        const query = `
            INSERT INTO user_roles (user_telegram_id, role, assigned_by, notes)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (user_telegram_id, role) DO NOTHING
        `

        const result = await pool.query(query, values)
        return result.rowCount || 0
    }
}
