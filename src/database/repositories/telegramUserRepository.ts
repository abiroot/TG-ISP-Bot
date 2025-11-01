import { pool } from '~/config/database'
import {
    TelegramUserMapping,
    CreateTelegramUserMapping,
    UpdateTelegramUserMapping,
} from '../schemas/telegramUserMapping'

export class TelegramUserRepository {
    /**
     * Get Telegram ID by username (primary use case for webhook)
     */
    async getTelegramIdByUsername(username: string): Promise<string | null> {
        const result = await pool.query(
            'SELECT telegram_id FROM telegram_user_mapping WHERE username = $1',
            [username]
        )
        return result.rows.length > 0 ? result.rows[0].telegram_id : null
    }

    /**
     * Get full user mapping by username
     */
    async getUserByUsername(username: string): Promise<TelegramUserMapping | null> {
        const result = await pool.query(
            'SELECT * FROM telegram_user_mapping WHERE username = $1',
            [username]
        )
        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Get full user mapping by Telegram ID
     */
    async getUserByTelegramId(telegramId: string): Promise<TelegramUserMapping | null> {
        const result = await pool.query(
            'SELECT * FROM telegram_user_mapping WHERE telegram_id = $1',
            [telegramId]
        )
        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Upsert user mapping (insert or update if exists)
     * Used by auto-capture middleware
     */
    async upsertUser(data: CreateTelegramUserMapping): Promise<TelegramUserMapping> {
        const result = await pool.query(
            `INSERT INTO telegram_user_mapping (username, telegram_id, telegram_username, first_name, last_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (username) DO UPDATE SET
                telegram_id = EXCLUDED.telegram_id,
                telegram_username = EXCLUDED.telegram_username,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                data.username,
                data.telegram_id,
                data.telegram_username || null,
                data.first_name || null,
                data.last_name || null,
            ]
        )
        return result.rows[0]
    }

    /**
     * Update existing user mapping
     */
    async updateUser(
        username: string,
        data: UpdateTelegramUserMapping
    ): Promise<TelegramUserMapping | null> {
        const updates: string[] = []
        const values: (string | undefined)[] = []
        let paramIndex = 1

        if (data.telegram_id !== undefined) {
            updates.push(`telegram_id = $${paramIndex++}`)
            values.push(data.telegram_id)
        }
        if (data.telegram_username !== undefined) {
            updates.push(`telegram_username = $${paramIndex++}`)
            values.push(data.telegram_username)
        }
        if (data.first_name !== undefined) {
            updates.push(`first_name = $${paramIndex++}`)
            values.push(data.first_name)
        }
        if (data.last_name !== undefined) {
            updates.push(`last_name = $${paramIndex++}`)
            values.push(data.last_name)
        }

        if (updates.length === 0) {
            return this.getUserByUsername(username)
        }

        updates.push('updated_at = CURRENT_TIMESTAMP')
        values.push(username)

        const result = await pool.query(
            `UPDATE telegram_user_mapping SET ${updates.join(', ')} WHERE username = $${paramIndex} RETURNING *`,
            values
        )

        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Get all user mappings
     */
    async getAllUsers(): Promise<TelegramUserMapping[]> {
        const result = await pool.query(
            'SELECT * FROM telegram_user_mapping ORDER BY created_at DESC'
        )
        return result.rows
    }

    /**
     * Delete user mapping by username
     */
    async deleteUser(username: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM telegram_user_mapping WHERE username = $1', [
            username,
        ])
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Check if username exists in mapping
     */
    async usernameExists(username: string): Promise<boolean> {
        const result = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM telegram_user_mapping WHERE username = $1)',
            [username]
        )
        return result.rows[0].exists
    }
}

// Export singleton instance
export const telegramUserRepository = new TelegramUserRepository()
