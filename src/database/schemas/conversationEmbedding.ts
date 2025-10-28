/**
 * Conversation Embedding Schema
 *
 * TypeScript types for the conversation_embeddings table which stores
 * vector embeddings of conversation chunks for semantic search and RAG.
 */

/**
 * Complete conversation embedding record from database
 */
export interface ConversationEmbedding {
    id: string
    context_id: string
    context_type: 'group' | 'private'
    chunk_text: string
    embedding: number[] // Vector stored as array of floats
    message_ids: string[] // Array of message IDs included in chunk
    chunk_index: number // Sequence number in conversation
    timestamp_start: Date
    timestamp_end: Date
    metadata: Record<string, any> // JSONB metadata
    created_at: Date
    updated_at: Date
}

/**
 * Data required to create a new conversation embedding
 */
export interface CreateConversationEmbedding {
    context_id: string
    context_type: 'group' | 'private'
    chunk_text: string
    embedding: number[] // 1536-dimensional vector from OpenAI
    message_ids: string[]
    chunk_index: number
    timestamp_start: Date
    timestamp_end: Date
    metadata?: Record<string, any>
}

/**
 * Data for updating an existing conversation embedding
 */
export interface UpdateConversationEmbedding {
    chunk_text?: string
    embedding?: number[]
    message_ids?: string[]
    timestamp_end?: Date
    metadata?: Record<string, any>
}

/**
 * Options for querying conversation embeddings
 */
export interface EmbeddingQueryOptions {
    context_id?: string
    context_type?: 'group' | 'private'
    after_date?: Date
    before_date?: Date
    limit?: number
    offset?: number
}

/**
 * Result from similarity search with distance score
 */
export interface SimilaritySearchResult {
    embedding: ConversationEmbedding
    similarity: number // Cosine similarity score (0-1, higher is more similar)
    distance: number // Cosine distance (0-2, lower is more similar)
}

/**
 * Options for similarity search
 */
export interface SimilaritySearchOptions {
    query_embedding: number[] // The query vector to search for
    context_id?: string // Filter by specific conversation context
    context_type?: 'group' | 'private' // Filter by context type
    after_date?: Date // Only search embeddings after this date
    before_date?: Date // Only search embeddings before this date
    top_k?: number // Number of results to return (default: 5)
    min_similarity?: number // Minimum similarity threshold (0-1)
    metadata_filter?: Record<string, any> // Filter by metadata fields
}

/**
 * Statistics about embeddings for a context
 */
export interface EmbeddingStats {
    total_chunks: number
    earliest_timestamp: Date | null
    latest_timestamp: Date | null
    total_messages: number // Sum of all message_ids array lengths
    avg_chunk_size: number // Average number of messages per chunk
}

/**
 * Chunk metadata that can be stored in the metadata JSONB field
 */
export interface ChunkMetadata {
    topics?: string[] // Extracted topics from conversation
    entities?: string[] // Named entities (people, places, things)
    sentiment?: 'positive' | 'negative' | 'neutral' // Overall sentiment
    language?: string // Detected language
    has_media?: boolean // Whether chunk contains media messages
    has_commands?: boolean // Whether chunk contains bot commands
    message_count?: number // Number of messages in chunk
    [key: string]: any // Allow additional custom metadata
}
