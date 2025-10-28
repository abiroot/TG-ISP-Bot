import { pool } from '~/config/database'
import {
    UserIdentifier,
    CreateUserIdentifier,
    UpdateUserIdentifier,
} from '../schemas/userIdentifiers'

export class UserIdentifierRepository {
    /**
     * Find user identifier by telegram_id
     */
    async findByTelegramId(telegramId: string): Promise<UserIdentifier | null> {
        const result = await pool.query(
            'SELECT * FROM user_identifiers WHERE telegram_id = $1 AND is_active = TRUE',
            [telegramId]
        )
        return result.rows[0] || null
    }

    /**
     * Find user identifier by username
     */
    async findByUsername(username: string): Promise<UserIdentifier | null> {
        // Remove @ symbol if present
        const cleanUsername = username.startsWith('@') ? username.substring(1) : username

        const result = await pool.query(
            'SELECT * FROM user_identifiers WHERE username = $1 AND is_active = TRUE',
            [cleanUsername]
        )
        return result.rows[0] || null
    }

    /**
     * Create or update user identifier
     */
    async upsert(data: CreateUserIdentifier): Promise<UserIdentifier> {
        const result = await pool.query(
            `INSERT INTO user_identifiers
                (telegram_id, username, first_name, last_name, display_name, push_name)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (telegram_id)
             DO UPDATE SET
                username = EXCLUDED.username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                display_name = EXCLUDED.display_name,
                push_name = EXCLUDED.push_name,
                is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                data.telegram_id,
                data.username ? data.username.replace('@', '') : null,
                data.first_name,
                data.last_name,
                data.display_name,
                data.push_name
            ]
        )
        return result.rows[0]
    }

    /**
     * Update user identifier
     */
    async update(telegramId: string, data: UpdateUserIdentifier): Promise<UserIdentifier | null> {
        const fields = []
        const values = []
        let paramIndex = 1

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                let processedValue = value
                // Always store username without @ prefix for consistency
                if (key === 'username' && typeof value === 'string' && value.startsWith('@')) {
                    processedValue = value.substring(1)
                }
                fields.push(`${key} = $${paramIndex}`)
                values.push(processedValue)
                paramIndex++
            }
        }

        if (fields.length === 0) {
            return await this.findByTelegramId(telegramId)
        }

        values.push(telegramId)

        const result = await pool.query(
            `UPDATE user_identifiers
             SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
             WHERE telegram_id = $${paramIndex} AND is_active = TRUE
             RETURNING *`,
            values
        )
        return result.rows[0] || null
    }

    /**
     * Deactivate user identifier (soft delete)
     */
    async deactivate(telegramId: string): Promise<boolean> {
        const result = await pool.query(
            'UPDATE user_identifiers SET is_active = FALSE WHERE telegram_id = $1',
            [telegramId]
        )
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Get all user identifiers
     */
    async getAll(limit = 100): Promise<UserIdentifier[]> {
        const result = await pool.query(
            'SELECT * FROM user_identifiers WHERE is_active = TRUE ORDER BY created_at DESC LIMIT $1',
            [limit]
        )
        return result.rows
    }

    /**
     * Search users by name or username
     */
    async search(query: string, limit = 50): Promise<UserIdentifier[]> {
        const searchPattern = `%${query}%`
        const result = await pool.query(
            `SELECT * FROM user_identifiers
             WHERE is_active = TRUE
             AND (
                 username ILIKE $1
                 OR display_name ILIKE $1
                 OR first_name ILIKE $1
                 OR last_name ILIKE $1
             )
             ORDER BY created_at DESC
             LIMIT $2`,
            [searchPattern, limit]
        )
        return result.rows
    }
}

// Export singleton instance
export const userIdentifierRepository = new UserIdentifierRepository()