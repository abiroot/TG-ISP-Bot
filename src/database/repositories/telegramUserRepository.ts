import { pool } from '~/config/database'
import {
    TelegramUserMapping,
    CreateTelegramUserMapping,
    UpdateTelegramUserMapping,
} from '../schemas/telegramUserMapping'

export class TelegramUserRepository {
    /**
     * Get Telegram ID by worker username (primary use case for webhook)
     */
    async getTelegramIdByUsername(username: string): Promise<string | null> {
        const result = await pool.query(
            'SELECT telegram_id FROM telegram_user_mapping WHERE worker_username = $1',
            [username]
        )
        return result.rows.length > 0 ? result.rows[0].telegram_id : null
    }

    /**
     * Get full user mapping by worker username
     */
    async getUserByUsername(username: string): Promise<TelegramUserMapping | null> {
        const result = await pool.query(
            'SELECT * FROM telegram_user_mapping WHERE worker_username = $1',
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
     * Find the next available username by checking existing numbered variants
     * Examples:
     * - If "josiane" exists, returns "josiane2"
     * - If "josiane" and "josiane2" exist, returns "josiane3"
     * - If "josiane", "josiane5" exist, returns "josiane6" (finds highest)
     */
    async findNextAvailableUsername(baseUsername: string): Promise<string> {
        // Query for all worker_usernames matching the pattern: baseUsername OR baseUsername + number
        // Uses PostgreSQL regex: ^baseUsername[0-9]*$
        const result = await pool.query(
            `SELECT worker_username FROM telegram_user_mapping
             WHERE worker_username ~ $1
             ORDER BY worker_username DESC`,
            [`^${baseUsername}[0-9]*$`]
        )

        if (result.rows.length === 0) {
            // No conflicts, use base username
            return baseUsername
        }

        // Extract numbers from all matching usernames
        const numbers: number[] = []
        for (const row of result.rows) {
            const username = row.worker_username
            if (username === baseUsername) {
                // Base username exists (no number suffix)
                numbers.push(1)
            } else {
                // Extract number from suffix (e.g., "josiane5" -> 5)
                const match = username.match(/^[a-z_]+(\d+)$/)
                if (match && match[1]) {
                    numbers.push(parseInt(match[1], 10))
                }
            }
        }

        // Find the highest number and add 1
        const maxNumber = Math.max(...numbers)
        const nextNumber = maxNumber === 1 ? 2 : maxNumber + 1

        return `${baseUsername}${nextNumber}`
    }

    /**
     * Upsert user mapping (insert or update if exists)
     * Used by auto-capture middleware
     * Automatically handles username conflicts by appending numbers
     */
    async upsertUser(data: CreateTelegramUserMapping): Promise<TelegramUserMapping> {
        const maxRetries = 5
        let currentUsername = data.worker_username
        let lastError: Error | null = null

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Check if user already exists by telegram_id
                const existingUser = await this.getUserByTelegramId(data.telegram_id)

                if (existingUser) {
                    // User exists - update their record using their existing worker_username
                    // This preserves the worker_username even if their name changed
                    const result = await pool.query(
                        `UPDATE telegram_user_mapping SET
                            telegram_handle = $1,
                            first_name = $2,
                            last_name = $3,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE telegram_id = $4
                         RETURNING *`,
                        [
                            data.telegram_handle || null,
                            data.first_name || null,
                            data.last_name || null,
                            data.telegram_id,
                        ]
                    )
                    return result.rows[0]
                }

                // New user - try to insert
                const result = await pool.query(
                    `INSERT INTO telegram_user_mapping (worker_username, telegram_id, telegram_handle, first_name, last_name)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING *`,
                    [
                        currentUsername,
                        data.telegram_id,
                        data.telegram_handle || null,
                        data.first_name || null,
                        data.last_name || null,
                    ]
                )
                return result.rows[0]
            } catch (error: any) {
                // Check if error is UNIQUE constraint violation on worker_username
                if (error.code === '23505' && error.constraint === 'telegram_user_mapping_username_key') {
                    lastError = error

                    // Extract base username (strip any existing number suffix)
                    const baseUsername = currentUsername.replace(/\d+$/, '')

                    // Find next available username
                    currentUsername = await this.findNextAvailableUsername(baseUsername)

                    // Retry with new numbered username
                    continue
                }

                // Different error - rethrow
                throw error
            }
        }

        // Max retries exceeded
        throw new Error(
            `Failed to upsert user after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`
        )
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
        if (data.telegram_handle !== undefined) {
            updates.push(`telegram_handle = $${paramIndex++}`)
            values.push(data.telegram_handle)
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
            `UPDATE telegram_user_mapping SET ${updates.join(', ')} WHERE worker_username = $${paramIndex} RETURNING *`,
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
     * Delete user mapping by worker username
     */
    async deleteUser(username: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM telegram_user_mapping WHERE worker_username = $1', [
            username,
        ])
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Delete user mapping by Telegram ID (GDPR)
     */
    async deleteByTelegramId(telegramId: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM telegram_user_mapping WHERE telegram_id = $1', [
            telegramId,
        ])
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Check if worker username exists in mapping
     */
    async usernameExists(username: string): Promise<boolean> {
        const result = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM telegram_user_mapping WHERE worker_username = $1)',
            [username]
        )
        return result.rows[0].exists
    }
}

// Export singleton instance
export const telegramUserRepository = new TelegramUserRepository()
