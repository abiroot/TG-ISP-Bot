import { pool } from '~/config/database'
import {
    WhitelistedGroup,
    WhitelistedUser,
    CreateWhitelistedGroup,
    CreateWhitelistedUser,
} from '../schemas/whitelist'

export class WhitelistRepository {
    // ===== GROUPS =====

    async isGroupWhitelisted(groupId: string): Promise<boolean> {
        const result = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM whitelisted_groups WHERE group_id = $1 AND is_active = TRUE)',
            [groupId]
        )
        return result.rows[0].exists
    }

    async addGroup(data: CreateWhitelistedGroup): Promise<WhitelistedGroup> {
        const result = await pool.query(
            `INSERT INTO whitelisted_groups (group_id, whitelisted_by, notes)
             VALUES ($1, $2, $3)
             ON CONFLICT (group_id) DO UPDATE SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [data.group_id, data.whitelisted_by, data.notes]
        )
        return result.rows[0]
    }

    async removeGroup(groupId: string): Promise<boolean> {
        const result = await pool.query(
            'UPDATE whitelisted_groups SET is_active = FALSE WHERE group_id = $1',
            [groupId]
        )
        return result.rowCount ? result.rowCount > 0 : false
    }

    async getAllGroups(): Promise<WhitelistedGroup[]> {
        const result = await pool.query(
            'SELECT * FROM whitelisted_groups WHERE is_active = TRUE ORDER BY whitelisted_at DESC'
        )
        return result.rows
    }

    // ===== USERS =====

    async isUserWhitelisted(userIdentifier: string): Promise<boolean> {
        const result = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM whitelisted_users WHERE user_identifier = $1 AND is_active = TRUE)',
            [userIdentifier]
        )
        return result.rows[0].exists
    }

    async addUser(data: CreateWhitelistedUser): Promise<WhitelistedUser> {
        const result = await pool.query(
            `INSERT INTO whitelisted_users (user_identifier, whitelisted_by, notes)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_identifier) DO UPDATE SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [data.user_identifier, data.whitelisted_by, data.notes]
        )
        return result.rows[0]
    }

    async removeUser(userIdentifier: string): Promise<boolean> {
        const result = await pool.query(
            'UPDATE whitelisted_users SET is_active = FALSE WHERE user_identifier = $1',
            [userIdentifier]
        )
        return result.rowCount ? result.rowCount > 0 : false
    }

    async getAllUsers(): Promise<WhitelistedUser[]> {
        const result = await pool.query(
            'SELECT * FROM whitelisted_users WHERE is_active = TRUE ORDER BY whitelisted_at DESC'
        )
        return result.rows
    }
}

// Export singleton instance
export const whitelistRepository = new WhitelistRepository()
