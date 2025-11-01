import { pool } from '~/config/database'
import {
    ConversationEmbedding,
    CreateConversationEmbedding,
    UpdateConversationEmbedding,
    EmbeddingQueryOptions,
    SimilaritySearchOptions,
    SimilaritySearchResult,
    EmbeddingStats,
} from '../schemas/conversationEmbedding'

/**
 * Repository for conversation embeddings operations
 * Handles all database interactions for vector embeddings
 */
export class EmbeddingRepository {
    /**
     * Create a new conversation embedding
     */
    async create(data: CreateConversationEmbedding): Promise<ConversationEmbedding> {
        const result = await pool.query(
            `INSERT INTO conversation_embeddings (
                context_id, context_type, chunk_text, embedding, message_ids,
                chunk_index, timestamp_start, timestamp_end
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                data.context_id,
                data.context_type,
                data.chunk_text,
                JSON.stringify(data.embedding), // pgvector accepts JSON array
                data.message_ids,
                data.chunk_index,
                data.timestamp_start,
                data.timestamp_end,
            ]
        )
        return this.parseEmbedding(result.rows[0])
    }

    /**
     * Get embedding by ID
     */
    async getById(id: string): Promise<ConversationEmbedding | null> {
        const result = await pool.query('SELECT * FROM conversation_embeddings WHERE id = $1', [id])
        return result.rows[0] ? this.parseEmbedding(result.rows[0]) : null
    }

    /**
     * Get all embeddings for a specific context
     */
    async getByContextId(contextId: string, options: EmbeddingQueryOptions = {}): Promise<ConversationEmbedding[]> {
        let query = 'SELECT * FROM conversation_embeddings WHERE context_id = $1'
        const params: any[] = [contextId]
        let paramIndex = 2

        if (options.after_date) {
            query += ` AND timestamp_start >= $${paramIndex++}`
            params.push(options.after_date)
        }

        if (options.before_date) {
            query += ` AND timestamp_end <= $${paramIndex++}`
            params.push(options.before_date)
        }

        query += ' ORDER BY chunk_index ASC'

        if (options.limit) {
            query += ` LIMIT $${paramIndex++}`
            params.push(options.limit)
        }

        if (options.offset) {
            query += ` OFFSET $${paramIndex}`
            params.push(options.offset)
        }

        const result = await pool.query(query, params)
        return result.rows.map((row) => this.parseEmbedding(row))
    }

    /**
     * Get the latest chunk index for a context
     */
    async getLatestChunkIndex(contextId: string): Promise<number> {
        const result = await pool.query(
            'SELECT MAX(chunk_index) as max_index FROM conversation_embeddings WHERE context_id = $1',
            [contextId]
        )
        return result.rows[0]?.max_index ?? -1
    }

    /**
     * Perform similarity search using cosine distance
     * This is the core RAG retrieval function
     */
    async similaritySearch(options: SimilaritySearchOptions): Promise<SimilaritySearchResult[]> {
        const topK = options.top_k ?? 5
        const minSimilarity = options.min_similarity ?? 0.0

        let query = `
            SELECT
                *,
                1 - (embedding <=> $1::vector) as similarity,
                embedding <=> $1::vector as distance
            FROM conversation_embeddings
            WHERE 1=1
        `
        const params: any[] = [JSON.stringify(options.query_embedding)]
        let paramIndex = 2

        // Apply filters
        if (options.context_id) {
            query += ` AND context_id = $${paramIndex++}`
            params.push(options.context_id)
        }

        if (options.context_type) {
            query += ` AND context_type = $${paramIndex++}`
            params.push(options.context_type)
        }

        if (options.after_date) {
            query += ` AND timestamp_start >= $${paramIndex++}`
            params.push(options.after_date)
        }

        if (options.before_date) {
            query += ` AND timestamp_end <= $${paramIndex++}`
            params.push(options.before_date)
        }

        // Apply similarity threshold
        if (minSimilarity > 0) {
            query += ` AND (1 - (embedding <=> $1::vector)) >= ${minSimilarity}`
        }

        // Order by similarity (highest first) and limit
        query += ` ORDER BY embedding <=> $1::vector LIMIT ${topK}`

        const result = await pool.query(query, params)

        return result.rows.map((row) => ({
            embedding: this.parseEmbedding(row),
            similarity: parseFloat(row.similarity),
            distance: parseFloat(row.distance),
        }))
    }

    /**
     * Update an existing embedding
     */
    async update(id: string, data: UpdateConversationEmbedding): Promise<ConversationEmbedding | null> {
        const fields: string[] = []
        const values: any[] = []
        let paramIndex = 1

        if (data.chunk_text !== undefined) {
            fields.push(`chunk_text = $${paramIndex++}`)
            values.push(data.chunk_text)
        }

        if (data.embedding !== undefined) {
            fields.push(`embedding = $${paramIndex++}`)
            values.push(JSON.stringify(data.embedding))
        }

        if (data.message_ids !== undefined) {
            fields.push(`message_ids = $${paramIndex++}`)
            values.push(data.message_ids)
        }

        if (data.timestamp_end !== undefined) {
            fields.push(`timestamp_end = $${paramIndex++}`)
            values.push(data.timestamp_end)
        }

        if (fields.length === 0) return null

        values.push(id)
        const query = `UPDATE conversation_embeddings SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`

        const result = await pool.query(query, values)
        return result.rows[0] ? this.parseEmbedding(result.rows[0]) : null
    }

    /**
     * Delete an embedding by ID
     */
    async delete(id: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM conversation_embeddings WHERE id = $1', [id])
        return result.rowCount ? result.rowCount > 0 : false
    }

    /**
     * Delete all embeddings for a context
     */
    async deleteByContextId(contextId: string): Promise<number> {
        const result = await pool.query('DELETE FROM conversation_embeddings WHERE context_id = $1', [contextId])
        return result.rowCount ?? 0
    }

    /**
     * Get statistics about embeddings for a context
     */
    async getStats(contextId: string): Promise<EmbeddingStats> {
        const result = await pool.query(
            `SELECT
                COUNT(*) as total_chunks,
                MIN(timestamp_start) as earliest_timestamp,
                MAX(timestamp_end) as latest_timestamp,
                SUM(array_length(message_ids, 1)) as total_messages,
                AVG(array_length(message_ids, 1)) as avg_chunk_size
            FROM conversation_embeddings
            WHERE context_id = $1`,
            [contextId]
        )

        const row = result.rows[0]
        return {
            total_chunks: parseInt(row.total_chunks) || 0,
            earliest_timestamp: row.earliest_timestamp || null,
            latest_timestamp: row.latest_timestamp || null,
            total_messages: parseInt(row.total_messages) || 0,
            avg_chunk_size: parseFloat(row.avg_chunk_size) || 0,
        }
    }

    /**
     * Check if embeddings exist for a context
     */
    async hasEmbeddings(contextId: string): Promise<boolean> {
        const result = await pool.query(
            'SELECT EXISTS(SELECT 1 FROM conversation_embeddings WHERE context_id = $1) as exists',
            [contextId]
        )
        return result.rows[0].exists
    }

    /**
     * Get count of embeddings for a context
     */
    async getCount(contextId: string): Promise<number> {
        const result = await pool.query('SELECT COUNT(*) FROM conversation_embeddings WHERE context_id = $1', [
            contextId,
        ])
        return parseInt(result.rows[0].count)
    }

    /**
     * Parse database row to ConversationEmbedding object
     * Handles type conversions for embedding vector and metadata
     */
    private parseEmbedding(row: any): ConversationEmbedding {
        return {
            id: row.id,
            context_id: row.context_id,
            context_type: row.context_type,
            chunk_text: row.chunk_text,
            embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
            message_ids: row.message_ids,
            chunk_index: row.chunk_index,
            timestamp_start: new Date(row.timestamp_start),
            timestamp_end: new Date(row.timestamp_end),
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
        }
    }

    /**
     * Find embeddings that need to be updated (e.g., message_ids changed)
     */
    async findStaleEmbeddings(contextId: string, afterDate: Date): Promise<ConversationEmbedding[]> {
        const result = await pool.query(
            `SELECT * FROM conversation_embeddings
             WHERE context_id = $1 AND timestamp_end >= $2
             ORDER BY chunk_index ASC`,
            [contextId, afterDate]
        )
        return result.rows.map((row) => this.parseEmbedding(row))
    }

    /**
     * Delete all embeddings for a specific user (GDPR/privacy)
     * Deletes embeddings where context_id matches the user identifier (private chats)
     * @param userIdentifier User's identifier (phone number, username, or ID)
     * @returns Number of embeddings deleted
     */
    async deleteByUser(userIdentifier: string): Promise<number> {
        // Delete embeddings where context_id is the user's identifier (private chats only)
        const result = await pool.query(
            'DELETE FROM conversation_embeddings WHERE context_id = $1 AND context_type = $2',
            [userIdentifier, 'private']
        )
        return result.rowCount ?? 0
    }
}

// Export singleton instance
export const embeddingRepository = new EmbeddingRepository()
