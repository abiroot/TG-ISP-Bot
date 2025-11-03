import { pool } from '~/config/database'
import {
    Message,
    CreateMessage,
    UpdateMessage,
    MessageFilter,
    ConversationHistoryOptions,
} from '../schemas/message'
import { getCircularReplacer } from '~/core/utils/jsonHelpers'

export class MessageRepository {

    /**
     * Create a new message
     */
    async create(data: CreateMessage): Promise<Message> {
        const result = await pool.query(
            `INSERT INTO messages (
                message_id, context_id, context_type, direction, sender, recipient,
                content, media_url, media_type, media_content_type, media_size,
                status, error_message, metadata,
                is_bot_command, is_admin_command, command_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [
                data.message_id,
                data.context_id,
                data.context_type,
                data.direction,
                data.sender,
                data.recipient || null,
                data.content || null,
                data.media_url || null,
                data.media_type || null,
                data.media_content_type || null,
                data.media_size || null,
                data.status || 'sent',
                data.error_message || null,
                JSON.stringify(data.metadata || {}, getCircularReplacer()),
                data.is_bot_command || false,
                data.is_admin_command || false,
                data.command_name || null,
            ]
        )
        return result.rows[0]
    }

    /**
     * Get message by ID
     */
    async getById(id: string): Promise<Message | null> {
        const result = await pool.query('SELECT * FROM messages WHERE id = $1 AND is_deleted = FALSE', [id])
        return result.rows[0] || null
    }

    /**
     * Get message by external message ID
     */
    async getByMessageId(messageId: string): Promise<Message | null> {
        const result = await pool.query('SELECT * FROM messages WHERE message_id = $1', [messageId])
        return result.rows[0] || null
    }

    /**
     * Update message
     */
    async update(id: string, data: UpdateMessage): Promise<Message | null> {
        const fields: string[] = []
        const values: any[] = []
        let paramIndex = 1

        if (data.status) {
            fields.push(`status = $${paramIndex++}`)
            values.push(data.status)
        }
        if (data.error_message !== undefined) {
            fields.push(`error_message = $${paramIndex++}`)
            values.push(data.error_message)
        }
        if (data.metadata) {
            fields.push(`metadata = $${paramIndex++}`)
            values.push(JSON.stringify(data.metadata, getCircularReplacer()))
        }

        if (fields.length === 0) return null

        values.push(id)

        const result = await pool.query(
            `UPDATE messages SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        )

        return result.rows[0] || null
    }

    /**
     * Get conversation history (most common query - uses optimized index)
     */
    async getConversationHistory(options: ConversationHistoryOptions): Promise<Message[]> {
        const limit = options.limit || 100
        const offset = options.offset || 0

        let query = `
            SELECT * FROM messages
            WHERE context_id = $1
            AND is_deleted = FALSE
        `
        const params: any[] = [options.context_id]
        let paramIndex = 2

        if (options.before_date) {
            query += ` AND created_at < $${paramIndex++}`
            params.push(options.before_date)
        }

        if (options.after_date) {
            query += ` AND created_at > $${paramIndex++}`
            params.push(options.after_date)
        }

        if (options.include_deleted) {
            query = query.replace('AND is_deleted = FALSE', '')
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`
        params.push(limit, offset)

        const result = await pool.query(query, params)
        return result.rows
    }

    /**
     * Get messages by filter (flexible querying)
     */
    async findByFilter(filter: MessageFilter): Promise<Message[]> {
        let query = 'SELECT * FROM messages WHERE is_deleted = FALSE'
        const params: any[] = []
        let paramIndex = 1

        if (filter.context_id) {
            query += ` AND context_id = $${paramIndex++}`
            params.push(filter.context_id)
        }

        if (filter.sender) {
            query += ` AND sender = $${paramIndex++}`
            params.push(filter.sender)
        }

        if (filter.direction) {
            query += ` AND direction = $${paramIndex++}`
            params.push(filter.direction)
        }

        if (filter.status) {
            query += ` AND status = $${paramIndex++}`
            params.push(filter.status)
        }

        if (filter.context_type) {
            query += ` AND context_type = $${paramIndex++}`
            params.push(filter.context_type)
        }

        if (filter.is_bot_command !== undefined) {
            query += ` AND is_bot_command = $${paramIndex++}`
            params.push(filter.is_bot_command)
        }

        if (filter.is_admin_command !== undefined) {
            query += ` AND is_admin_command = $${paramIndex++}`
            params.push(filter.is_admin_command)
        }

        if (filter.has_media) {
            query += ` AND media_url IS NOT NULL`
        }

        if (filter.from_date) {
            query += ` AND created_at >= $${paramIndex++}`
            params.push(filter.from_date)
        }

        if (filter.to_date) {
            query += ` AND created_at <= $${paramIndex++}`
            params.push(filter.to_date)
        }

        query += ` ORDER BY created_at DESC`

        if (filter.limit) {
            query += ` LIMIT $${paramIndex++}`
            params.push(filter.limit)
        }

        if (filter.offset) {
            query += ` OFFSET $${paramIndex++}`
            params.push(filter.offset)
        }

        const result = await pool.query(query, params)
        return result.rows
    }

    /**
     * Get failed messages (for monitoring)
     */
    async getFailedMessages(contextId?: string, limit = 50): Promise<Message[]> {
        let query = `
            SELECT * FROM messages
            WHERE status = 'failed' AND is_deleted = FALSE
        `
        const params: any[] = []

        if (contextId) {
            query += ` AND context_id = $1`
            params.push(contextId)
        }

        query += ` ORDER BY created_at DESC LIMIT ${limit}`

        const result = await pool.query(query, params)
        return result.rows
    }

    /**
     * Get message count for a context
     */
    async getMessageCount(contextId: string): Promise<number> {
        const result = await pool.query(
            'SELECT COUNT(*) FROM messages WHERE context_id = $1 AND is_deleted = FALSE',
            [contextId]
        )
        return parseInt(result.rows[0].count)
    }

    /**
     * Soft delete a message (for GDPR compliance)
     */
    async softDelete(id: string): Promise<boolean> {
        const result = await pool.query(
            'UPDATE messages SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        )
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Hard delete a message (permanent)
     */
    async hardDelete(id: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM messages WHERE id = $1', [id])
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Get messages with media (for media gallery features)
     */
    async getMediaMessages(contextId: string, limit = 50, offset = 0): Promise<Message[]> {
        const result = await pool.query(
            `SELECT * FROM messages
             WHERE context_id = $1 AND media_url IS NOT NULL AND is_deleted = FALSE
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [contextId, limit, offset]
        )
        return result.rows
    }

    /**
     * Get message statistics for a context
     */
    async getMessageStats(contextId: string): Promise<{
        total: number
        incoming: number
        outgoing: number
        with_media: number
        commands: number
        failed: number
    }> {
        const result = await pool.query(
            `SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE direction = 'incoming') as incoming,
                COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing,
                COUNT(*) FILTER (WHERE media_url IS NOT NULL) as with_media,
                COUNT(*) FILTER (WHERE is_bot_command = TRUE OR is_admin_command = TRUE) as commands,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
             FROM messages
             WHERE context_id = $1 AND is_deleted = FALSE`,
            [contextId]
        )
        return {
            total: parseInt(result.rows[0].total),
            incoming: parseInt(result.rows[0].incoming),
            outgoing: parseInt(result.rows[0].outgoing),
            with_media: parseInt(result.rows[0].with_media),
            commands: parseInt(result.rows[0].commands),
            failed: parseInt(result.rows[0].failed),
        }
    }

    /**
     * Check if message exists (prevent duplicates)
     */
    async exists(messageId: string): Promise<boolean> {
        const result = await pool.query('SELECT EXISTS(SELECT 1 FROM messages WHERE message_id = $1)', [messageId])
        return result.rows[0].exists
    }

    /**
     * Delete all messages for a specific user (GDPR/privacy)
     * Deletes messages where the user is the sender
     * @param userIdentifier User's identifier (phone number, username, or ID)
     * @returns Number of messages deleted
     */
    async deleteByUser(userIdentifier: string): Promise<number> {
        // Hard delete messages where user is the sender
        const result = await pool.query('DELETE FROM messages WHERE sender = $1', [userIdentifier])
        return result.rowCount ?? 0
    }

    /**
     * Delete all messages for a specific context (useful for testing)
     * @param contextId Context ID (phone number or group ID)
     * @returns Number of messages deleted
     */
    async deleteByContextId(contextId: string): Promise<number> {
        const result = await pool.query('DELETE FROM messages WHERE context_id = $1', [contextId])
        return result.rowCount ?? 0
    }

    /**
     * Get unfulfilled location requests (webhook notifications without corresponding location records)
     * Returns webhook messages from the last N days where no location was ever created
     * @param daysBack Number of days to look back (default: 7)
     * @returns Array of unfulfilled location requests with worker details
     */
    async getUnfulfilledLocationRequests(daysBack = 7): Promise<
        Array<{
            message_id: string
            client_username: string
            worker_telegram_id: string
            webhook_tg_username: string | null
            webhook_worker_username: string | null
            worker_username: string | null
            worker_first_name: string | null
            worker_last_name: string | null
            worker_telegram_handle: string | null
            webhook_sent_at: Date
        }>
    > {
        const query = `
            SELECT
                m.id AS message_id,
                m.metadata->>'client_username' AS client_username,
                m.sender AS worker_telegram_id,
                m.metadata->>'tg_username' AS webhook_tg_username,
                m.metadata->>'worker_username' AS webhook_worker_username,
                tum.worker_username,
                tum.first_name AS worker_first_name,
                tum.last_name AS worker_last_name,
                tum.telegram_handle AS worker_telegram_handle,
                m.created_at AS webhook_sent_at
            FROM messages m
            LEFT JOIN telegram_user_mapping tum
                ON tum.telegram_id = m.sender
            LEFT JOIN customer_locations cl
                ON cl.isp_username = m.metadata->>'client_username'
            WHERE
                m.metadata->>'webhook' = 'collector_payment'
                AND m.created_at >= NOW() - INTERVAL '${daysBack} days'
                AND cl.id IS NULL
                AND m.is_deleted = FALSE
            ORDER BY m.created_at DESC
        `

        const result = await pool.query(query)
        return result.rows
    }
}

// Export singleton instance
export const messageRepository = new MessageRepository()
