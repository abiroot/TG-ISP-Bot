import { Message } from '~/database/schemas/message'

/**
 * Options for chunking conversations
 */
export interface ChunkOptions {
    chunkSize: number // Number of messages per chunk
    overlap: number // Number of overlapping messages between chunks
    minChunkSize?: number // Minimum messages required to create a chunk
}

/**
 * A chunk of conversation messages
 */
export interface ConversationChunk {
    messages: Message[]
    chunkIndex: number
    chunkText: string // Concatenated text of all messages
    messageIds: string[]
    timestampStart: Date
    timestampEnd: Date
}

/**
 * Chunk conversation messages into overlapping windows
 * for embedding generation
 */
export class TextChunker {
    /**
     * Chunk messages with sliding window approach
     *
     * @param messages - Array of messages in chronological order
     * @param options - Chunking configuration
     * @returns Array of conversation chunks
     *
     * @example
     * const messages = [msg1, msg2, msg3, msg4, msg5]
     * const chunks = TextChunker.chunkMessages(messages, { chunkSize: 3, overlap: 1 })
     * // Result:
     * // Chunk 0: [msg1, msg2, msg3]
     * // Chunk 1: [msg3, msg4, msg5]  <- overlap of 1 message
     */
    static chunkMessages(messages: Message[], options: ChunkOptions): ConversationChunk[] {
        const { chunkSize, overlap, minChunkSize = 3 } = options
        const chunks: ConversationChunk[] = []

        // Validate inputs
        if (messages.length === 0) {
            return chunks
        }

        if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
            throw new Error(`Invalid chunk options: chunkSize=${chunkSize}, overlap=${overlap}`)
        }

        // If not enough messages for minimum chunk, return empty
        if (messages.length < minChunkSize) {
            return chunks
        }

        const step = chunkSize - overlap // How many messages to advance for each chunk
        let chunkIndex = 0

        for (let i = 0; i < messages.length; i += step) {
            const chunkMessages = messages.slice(i, i + chunkSize)

            // Skip if chunk is smaller than minimum (last partial chunk)
            if (chunkMessages.length < minChunkSize) {
                break
            }

            const chunk = this.createChunk(chunkMessages, chunkIndex)
            chunks.push(chunk)
            chunkIndex++

            // Break if we've reached the end
            if (i + chunkSize >= messages.length) {
                break
            }
        }

        return chunks
    }

    /**
     * Create a conversation chunk from messages
     */
    private static createChunk(messages: Message[], chunkIndex: number): ConversationChunk {
        const chunkText = this.formatMessagesAsText(messages)
        const messageIds = messages.map((msg) => msg.message_id)
        const timestampStart = new Date(messages[0].created_at)
        const timestampEnd = new Date(messages[messages.length - 1].created_at)

        return {
            messages,
            chunkIndex,
            chunkText,
            messageIds,
            timestampStart,
            timestampEnd,
        }
    }

    /**
     * Format messages as text for embedding
     * Includes sender context and message content
     */
    static formatMessagesAsText(messages: Message[]): string {
        return messages
            .filter((msg) => msg.content) // Only include messages with content
            .map((msg) => {
                const role = msg.direction === 'incoming' ? 'User' : 'Assistant'
                const timestamp = new Date(msg.created_at).toISOString()
                const content = msg.content!

                // Include media context if present
                let mediaInfo = ''
                if (msg.media_type) {
                    mediaInfo = ` [${msg.media_type}]`
                }

                return `[${timestamp}] ${role}${mediaInfo}: ${content}`
            })
            .join('\n')
    }

    /**
     * Extract metadata from a chunk of messages
     * Useful for filtering and categorization
     */
    static extractChunkMetadata(messages: Message[]): Record<string, any> {
        const hasMedia = messages.some((msg) => msg.media_url !== null)
        const hasCommands = messages.some((msg) => msg.is_bot_command || msg.is_admin_command)
        const messageCount = messages.length

        // Count message types
        const incomingCount = messages.filter((msg) => msg.direction === 'incoming').length
        const outgoingCount = messages.filter((msg) => msg.direction === 'outgoing').length

        // Detect if conversation is a command session
        const isCommandSession = hasCommands && incomingCount <= 2

        return {
            message_count: messageCount,
            has_media: hasMedia,
            has_commands: hasCommands,
            is_command_session: isCommandSession,
            incoming_count: incomingCount,
            outgoing_count: outgoingCount,
        }
    }

    /**
     * Calculate optimal chunk size based on message statistics
     * Useful for adaptive chunking
     */
    static calculateOptimalChunkSize(avgMessageLength: number, targetTokens = 1500): number {
        // Rough estimate: 1 token ≈ 4 characters
        const avgTokensPerMessage = avgMessageLength / 4
        const optimalChunkSize = Math.floor(targetTokens / avgTokensPerMessage)

        // Clamp between reasonable bounds
        return Math.max(3, Math.min(20, optimalChunkSize))
    }

    /**
     * Merge consecutive small chunks into larger ones
     * Useful when messages are very short
     */
    static mergeSmallChunks(chunks: ConversationChunk[], minTokens = 500): ConversationChunk[] {
        if (chunks.length === 0) return []

        const merged: ConversationChunk[] = []
        let currentChunk: ConversationChunk | null = null

        for (const chunk of chunks) {
            const estimatedTokens = chunk.chunkText.length / 4 // Rough estimate

            if (!currentChunk) {
                currentChunk = chunk
            } else if (estimatedTokens < minTokens) {
                // Merge with current chunk
                currentChunk = this.mergeTwoChunks(currentChunk, chunk)
            } else {
                // Push current and start new
                merged.push(currentChunk)
                currentChunk = chunk
            }
        }

        // Push last chunk
        if (currentChunk) {
            merged.push(currentChunk)
        }

        // Re-index chunks
        return merged.map((chunk, index) => ({ ...chunk, chunkIndex: index }))
    }

    /**
     * Merge two chunks into one
     */
    private static mergeTwoChunks(chunk1: ConversationChunk, chunk2: ConversationChunk): ConversationChunk {
        const messages = [...chunk1.messages, ...chunk2.messages]
        return this.createChunk(messages, chunk1.chunkIndex)
    }

    /**
     * Estimate token count for a chunk
     * Uses rough approximation: 1 token ≈ 4 characters
     */
    static estimateTokenCount(chunkText: string): number {
        return Math.ceil(chunkText.length / 4)
    }
}
