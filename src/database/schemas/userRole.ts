/**
 * User Role Schema
 *
 * TypeScript interface for user_roles table
 * Database-backed role-based access control (RBAC)
 */

import type { RoleName } from '~/config/roles.js'

/**
 * User Role database record
 *
 * Represents a single role assignment for a user
 */
export interface UserRole {
    /** UUID primary key */
    id: string

    /** Telegram numeric user ID (e.g., "123456789") */
    user_telegram_id: string

    /** Role name: admin, collector, or worker */
    role: RoleName

    /** Telegram ID of admin who assigned this role ("system" for auto-migrated) */
    assigned_by: string

    /** When the role was assigned */
    assigned_at: Date

    /** Optional notes about why role was assigned */
    notes: string | null

    /** FALSE = role revoked (soft delete) */
    is_active: boolean

    /** Telegram ID of admin who revoked this role (NULL if active) */
    revoked_by: string | null

    /** When the role was revoked (NULL if active) */
    revoked_at: Date | null

    /** Record creation timestamp */
    created_at: Date

    /** Record last update timestamp */
    updated_at: Date
}

/**
 * Input for creating a new role assignment
 */
export interface CreateUserRoleInput {
    /** Telegram numeric user ID */
    user_telegram_id: string

    /** Role to assign */
    role: RoleName

    /** Telegram ID of admin assigning the role */
    assigned_by: string

    /** Optional notes */
    notes?: string
}

/**
 * Input for revoking a role
 */
export interface RevokeUserRoleInput {
    /** Telegram numeric user ID */
    user_telegram_id: string

    /** Role to revoke */
    role: RoleName

    /** Telegram ID of admin revoking the role */
    revoked_by: string
}

/**
 * User role summary (for display)
 */
export interface UserRoleSummary {
    /** Telegram user ID */
    user_telegram_id: string

    /** Active roles for this user */
    roles: RoleName[]

    /** Number of active roles */
    role_count: number

    /** When the first role was assigned */
    first_assigned_at: Date | null

    /** When the most recent role was assigned */
    last_assigned_at: Date | null
}
