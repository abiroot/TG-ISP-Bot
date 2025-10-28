/**
 * Bot State Repository
 *
 * Data access layer for persistent bot state
 */

import { pool } from '~/config/database'
import { BotState, CreateBotState, UpdateBotState } from '~/database/schemas/botState'

class BotStateRepository {
    /**
     * Get state by key
     */
    async get(key: string): Promise<BotState | null> {
        const result = await pool.query<BotState>('SELECT * FROM bot_state WHERE key = $1', [key])

        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Get all state entries
     */
    async getAll(): Promise<BotState[]> {
        const result = await pool.query<BotState>('SELECT * FROM bot_state ORDER BY key')

        return result.rows
    }

    /**
     * Create or update state (upsert)
     */
    async set(key: string, value: Record<string, any>): Promise<BotState> {
        const result = await pool.query<BotState>(
            `INSERT INTO bot_state (key, value, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (key)
             DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [key, JSON.stringify(value)]
        )

        return result.rows[0]
    }

    /**
     * Update existing state
     */
    async update(key: string, updates: UpdateBotState): Promise<BotState | null> {
        const result = await pool.query<BotState>(
            `UPDATE bot_state
             SET value = $2, updated_at = CURRENT_TIMESTAMP
             WHERE key = $1
             RETURNING *`,
            [key, JSON.stringify(updates.value)]
        )

        return result.rows.length > 0 ? result.rows[0] : null
    }

    /**
     * Delete state by key
     */
    async delete(key: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM bot_state WHERE key = $1', [key])

        return (result.rowCount ?? 0) > 0
    }

    /**
     * Check if state key exists
     */
    async exists(key: string): Promise<boolean> {
        const result = await pool.query<{ exists: boolean }>(
            'SELECT EXISTS(SELECT 1 FROM bot_state WHERE key = $1) as exists',
            [key]
        )

        return result.rows[0].exists
    }

    /**
     * Get state value as typed object
     */
    async getValue<T = Record<string, any>>(key: string): Promise<T | null> {
        const state = await this.get(key)
        return state ? (state.value as T) : null
    }

    /**
     * Merge value with existing state (shallow merge)
     */
    async merge(key: string, partialValue: Record<string, any>): Promise<BotState> {
        const existing = await this.get(key)
        const currentValue = existing?.value || {}

        const mergedValue = {
            ...currentValue,
            ...partialValue,
        }

        return await this.set(key, mergedValue)
    }
}

export const botStateRepository = new BotStateRepository()
