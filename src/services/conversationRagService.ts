import { OpenAIEmbeddings } from '@langchain/openai'
import { env } from '~/config/env'
import { Message } from '~/database/schemas/message'
import { embeddingRepository } from '~/database/repositories/embeddingRepository'
import { messageService } from './messageService'
import { TextChunker, ChunkOptions } from '~/utils/textChunker'
import { SimilaritySearchResult } from '~/database/schemas/conversationEmbedding'
import { createFlowLogger } from '~/utils/logger'

const ragLogger = createFlowLogger('rag-service')

/**
 * Configuration for RAG service
 */
export interface RagConfig {
    chunkSize: number // Messages per chunk
    chunkOverlap: number // Overlapping messages
    topK: number // Number of similar chunks to retrieve
    minSimilarity: number // Minimum similarity threshold (0-1)
    embeddingModel: string // OpenAI embedding model
}

/**
 * Result from RAG retrieval
 */
export interface RagRetrievalResult {
    relevantChunks: SimilaritySearchResult[]
    relevantMessages: Message[] // Deduplicated messages from chunks
    contextText: string // Formatted text for AI
    totalChunks: number
    avgSimilarity: number
    retrievalTimeMs: number
}

/**
 * Conversation RAG Service
 * Handles embedding generation, storage, and semantic retrieval
 */
export class ConversationRagService {
    private embeddings: OpenAIEmbeddings
    private config: RagConfig

    constructor(config?: Partial<RagConfig>) {
        this.config = {
            chunkSize: 10,
            chunkOverlap: 2,
            topK: 3,
            minSimilarity: 0.5,
            embeddingModel: 'text-embedding-3-small',
            ...config,
        }

        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: env.OPENAI_API_KEY,
            modelName: this.config.embeddingModel,
        })

        ragLogger.info({ config: this.config }, 'RAG service initialized')
    }

    /**
     * Embed a chunk of conversation and store in database
     */
    async embedAndStoreChunk(contextId: string, messages: Message[]): Promise<void> {
        if (messages.length === 0) {
            ragLogger.warn({ contextId }, 'No messages to embed')
            return
        }

        try {
            // Create chunk
            const chunkOptions: ChunkOptions = {
                chunkSize: this.config.chunkSize,
                overlap: this.config.chunkOverlap,
            }

            const chunks = TextChunker.chunkMessages(messages, chunkOptions)
            ragLogger.debug({ contextId, chunksCreated: chunks.length }, 'Created chunks for embedding')

            // Get current highest chunk index
            const latestIndex = await embeddingRepository.getLatestChunkIndex(contextId)

            // Embed and store each chunk
            for (const chunk of chunks) {
                const embedding = await this.embeddings.embedQuery(chunk.chunkText)
                const metadata = TextChunker.extractChunkMetadata(chunk.messages)

                await embeddingRepository.create({
                    context_id: contextId,
                    context_type: messages[0].context_type,
                    chunk_text: chunk.chunkText,
                    embedding: embedding,
                    message_ids: chunk.messageIds,
                    chunk_index: latestIndex + chunk.chunkIndex + 1,
                    timestamp_start: chunk.timestampStart,
                    timestamp_end: chunk.timestampEnd,
                    metadata,
                })

                ragLogger.debug(
                    {
                        contextId,
                        chunkIndex: chunk.chunkIndex,
                        messageCount: chunk.messages.length,
                        tokenEstimate: TextChunker.estimateTokenCount(chunk.chunkText),
                    },
                    'Chunk embedded and stored'
                )
            }

            ragLogger.info({ contextId, chunksStored: chunks.length }, 'Successfully embedded and stored chunks')
        } catch (error) {
            ragLogger.error({ err: error, contextId }, 'Failed to embed and store chunk')
            throw error
        }
    }

    /**
     * Process and embed recent unembedded messages for a context
     * This is called periodically by the background worker
     */
    async processUnembeddedMessages(contextId: string): Promise<number> {
        try {
            // Get latest embedded timestamp
            const stats = await embeddingRepository.getStats(contextId)
            const lastEmbeddedTime = stats.latest_timestamp || new Date(0)

            // Get messages after last embedded timestamp
            const unembeddedMessages = await messageService.getConversationHistory(contextId, 1000, 0)
            const messagesToEmbed = unembeddedMessages.filter(
                (msg) => new Date(msg.created_at) > lastEmbeddedTime && msg.content // Only messages with content
            )

            if (messagesToEmbed.length === 0) {
                ragLogger.debug({ contextId }, 'No new messages to embed')
                return 0
            }

            ragLogger.info({ contextId, messageCount: messagesToEmbed.length }, 'Processing unembedded messages')

            await this.embedAndStoreChunk(contextId, messagesToEmbed)

            return messagesToEmbed.length
        } catch (error) {
            ragLogger.error({ err: error, contextId }, 'Failed to process unembedded messages')
            throw error
        }
    }

    /**
     * Retrieve relevant conversation context using semantic search
     * This is the core RAG retrieval function
     */
    async retrieveRelevantContext(contextId: string, query: string): Promise<RagRetrievalResult> {
        const startTime = Date.now()

        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddings.embedQuery(query)
            ragLogger.debug({ contextId, queryLength: query.length }, 'Generated query embedding')

            // Perform similarity search
            const searchResults = await embeddingRepository.similaritySearch({
                query_embedding: queryEmbedding,
                context_id: contextId,
                top_k: this.config.topK,
                min_similarity: this.config.minSimilarity,
            })

            ragLogger.info(
                {
                    contextId,
                    resultsFound: searchResults.length,
                    similarities: searchResults.map((r) => r.similarity.toFixed(3)),
                },
                'Similarity search completed'
            )

            // Extract and deduplicate messages
            const relevantMessages = await this.extractMessagesFromChunks(searchResults)

            // Format context text
            const contextText = this.formatRetrievedContext(searchResults)

            // Calculate statistics
            const avgSimilarity =
                searchResults.length > 0
                    ? searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length
                    : 0

            const retrievalTimeMs = Date.now() - startTime

            ragLogger.info(
                {
                    contextId,
                    chunksRetrieved: searchResults.length,
                    messagesRetrieved: relevantMessages.length,
                    avgSimilarity: avgSimilarity.toFixed(3),
                    durationMs: retrievalTimeMs,
                },
                'RAG retrieval completed'
            )

            return {
                relevantChunks: searchResults,
                relevantMessages,
                contextText,
                totalChunks: searchResults.length,
                avgSimilarity,
                retrievalTimeMs,
            }
        } catch (error) {
            ragLogger.error({ err: error, contextId }, 'Failed to retrieve relevant context')
            throw error
        }
    }

    /**
     * Extract deduplicated messages from similarity search results
     */
    private async extractMessagesFromChunks(searchResults: SimilaritySearchResult[]): Promise<Message[]> {
        // Collect all message IDs
        const allMessageIds = new Set<string>()
        for (const result of searchResults) {
            result.embedding.message_ids.forEach((id) => allMessageIds.add(id))
        }

        // Fetch messages (this could be optimized with batch fetching)
        // For now, we return an empty array and use the chunk text directly
        // In a production system, you might want to fetch actual messages from DB
        const messages: Message[] = []

        return messages
    }

    /**
     * Format retrieved chunks as context for AI
     */
    private formatRetrievedContext(searchResults: SimilaritySearchResult[]): string {
        if (searchResults.length === 0) {
            return ''
        }

        const sections = searchResults.map((result, index) => {
            const relevanceScore = (result.similarity * 100).toFixed(1)
            const timeRange = `${result.embedding.timestamp_start.toISOString()} to ${result.embedding.timestamp_end.toISOString()}`

            return `--- Relevant Context ${index + 1} (${relevanceScore}% relevant, ${timeRange}) ---\n${result.embedding.chunk_text}`
        })

        return sections.join('\n\n')
    }

    /**
     * Check if a context has embeddings
     */
    async hasEmbeddings(contextId: string): Promise<boolean> {
        return await embeddingRepository.hasEmbeddings(contextId)
    }

    /**
     * Get embedding statistics for a context
     */
    async getStats(contextId: string) {
        return await embeddingRepository.getStats(contextId)
    }

    /**
     * Delete all embeddings for a context
     * Useful for GDPR compliance or resetting
     */
    async deleteEmbeddings(contextId: string): Promise<number> {
        ragLogger.info({ contextId }, 'Deleting all embeddings for context')
        return await embeddingRepository.deleteByContextId(contextId)
    }

    /**
     * Rebuild embeddings for a context from scratch
     * Useful for reprocessing after algorithm changes
     */
    async rebuildEmbeddings(contextId: string): Promise<void> {
        ragLogger.info({ contextId }, 'Rebuilding embeddings for context')

        // Delete existing embeddings
        await this.deleteEmbeddings(contextId)

        // Get all messages
        const allMessages = await messageService.getConversationHistory(contextId, 10000, 0)
        const messagesWithContent = allMessages.filter((msg) => msg.content)

        ragLogger.info({ contextId, totalMessages: messagesWithContent.length }, 'Fetched messages for rebuilding')

        // Embed and store
        await this.embedAndStoreChunk(contextId, messagesWithContent)

        ragLogger.info({ contextId }, 'Embeddings rebuilt successfully')
    }

    /**
     * Get configuration
     */
    getConfig(): RagConfig {
        return { ...this.config }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<RagConfig>): void {
        this.config = { ...this.config, ...newConfig }
        ragLogger.info({ config: this.config }, 'RAG configuration updated')
    }
}

// Export singleton instance with default config
export const conversationRagService = new ConversationRagService()
