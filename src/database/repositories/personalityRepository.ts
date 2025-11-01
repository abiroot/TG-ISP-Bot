import { pool } from '~/config/database'
import { Personality, CreatePersonality, UpdatePersonality } from '../schemas/personality'

export class PersonalityRepository {
    async getByContextId(contextId: string): Promise<Personality | null> {
        const result = await pool.query(
            'SELECT * FROM personalities WHERE context_id = $1',
            [contextId]
        )
        return result.rows[0] || null
    }

    async create(data: CreatePersonality): Promise<Personality> {
        const result = await pool.query(
            `INSERT INTO personalities (context_id, context_type, bot_name, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
                data.context_id,
                data.context_type,
                data.bot_name,
                data.created_by,
            ]
        )
        return result.rows[0]
    }

    async update(contextId: string, data: UpdatePersonality): Promise<Personality | null> {
        const fields: string[] = []
        const values: any[] = []
        let paramIndex = 1

        if (data.bot_name) {
            fields.push(`bot_name = $${paramIndex++}`)
            values.push(data.bot_name)
        }

        if (fields.length === 0) return null

        values.push(contextId)

        const result = await pool.query(
            `UPDATE personalities SET ${fields.join(', ')} WHERE context_id = $${paramIndex} RETURNING *`,
            values
        )

        return result.rows[0] || null
    }

    async exists(contextId: string): Promise<boolean> {
        const result = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM personalities WHERE context_id = $1)',
            [contextId]
        )
        return result.rows[0].exists
    }

    async delete(contextId: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM personalities WHERE context_id = $1', [contextId])
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Delete all personalities for a specific user (GDPR/privacy)
     * Deletes personalities where context_id matches the user identifier (private chats)
     * @param userIdentifier User's identifier (phone number, username, or ID)
     * @returns Number of personalities deleted
     */
    async deleteByUser(userIdentifier: string): Promise<number> {
        // Delete personalities where context_id is the user's identifier (private chats only)
        const result = await pool.query('DELETE FROM personalities WHERE context_id = $1 AND context_type = $2', [
            userIdentifier,
            'private',
        ])
        return result.rowCount ?? 0
    }
}

// Export singleton instance
export const personalityRepository = new PersonalityRepository()
