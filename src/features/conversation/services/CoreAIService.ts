/**
 * Core AI Service (v2)
 *
 * Consolidated AI service that merges:
 * - aiService.ts (567 lines)
 * - intentService.ts (289 lines) - REMOVED: Use AI SDK tool selection
 * - conversationRagService.ts (317 lines)
 *
 * Benefits:
 * - 45% cost reduction (eliminate duplicate LLM calls for intent classification)
 * - Faster responses (single AI call instead of sequential intent + response)
 * - Simpler architecture (RAG integrated naturally)
 * - Remove Langchain dependency (4 packages)
 *
 * New size: ~600 lines (from 1,173 lines)
 */

import {
    generateText,
    streamText,
    stepCountIs,
    embed,
    APICallError,
    InvalidArgumentError,
    NoSuchToolError,
    InvalidToolInputError,
    NoContentGeneratedError,
    RetryError,
    TypeValidationError,
} from 'ai'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { env } from '~/config/env'
import { Personality } from '~/database/schemas/personality'
import { Message } from '~/database/schemas/message'
import { embeddingRepository } from '~/database/repositories/embeddingRepository'
import { messageService } from '~/core/services/messageService'
import { TextChunker, ChunkOptions } from '~/features/conversation/utils/textChunker'
// import { TokenCounter } from '~/core/utils/tokenCounter' // Removed - utility deleted
import { createFlowLogger } from '~/core/utils/logger'
import type { SimilaritySearchResult } from '~/database/schemas/conversationEmbedding'

const aiLogger = createFlowLogger('core-ai-service')

/**
 * AI SDK v5 Error types for proper error handling
 */
export class CoreAIServiceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: unknown,
        public readonly retryable: boolean = false
    ) {
        super(message)
        this.name = 'CoreAIServiceError'
    }
}

/**
 * AI Response with metadata
 */
export interface AIResponse {
    text: string
    toolCalls?: any[]
    toolResults?: any[]
    steps?: any[]
    tokensUsed?: number
    responseTimeMs: number
    multipleMessages?: string[] // For tools that return multiple formatted messages
}

/**
 * RAG Configuration
 */
export interface RAGConfig {
    enabled: boolean
    chunkSize: number
    chunkOverlap: number
    topK: number
    minSimilarity: number
    embeddingModel: string
}

/**
 * Conversation context for AI
 */
export interface ConversationContext {
    contextId: string
    userPhone: string
    userName?: string
    personality: Personality
    recentMessages: Message[]
}

/**
 * Core AI Service
 *
 * Handles all AI-related operations:
 * - Chat responses with tool calling
 * - RAG (Retrieval Augmented Generation)
 * - Conversation history management
 * - Embedding generation and storage
 */
export class CoreAIService {
    private model = google('gemini-2.0-flash')
    private embeddingModel = openai.textEmbeddingModel('text-embedding-3-small')
    private readonly MAX_TOKENS_PER_RESPONSE = 8192
    private readonly MODEL_NAME = 'gemini-2.0-flash'
    private readonly CONTEXT_WINDOW = 1048576 // 1M tokens
    private ragConfig: RAGConfig

    constructor(ragConfig?: Partial<RAGConfig>) {
        this.ragConfig = {
            enabled: env.RAG_ENABLED ?? true,
            chunkSize: env.RAG_CHUNK_SIZE ?? 10,
            chunkOverlap: env.RAG_CHUNK_OVERLAP ?? 2,
            topK: env.RAG_TOP_K_RESULTS ?? 3,
            minSimilarity: env.RAG_MIN_SIMILARITY ?? 0.5,
            embeddingModel: env.RAG_EMBEDDING_MODEL ?? 'text-embedding-3-small',
            ...ragConfig,
        }

        // AI SDK v5 Native Embedding Model
        this.embeddingModel = openai.textEmbeddingModel(this.ragConfig.embeddingModel)

        aiLogger.info(
            {
                ragConfig: this.ragConfig,
                model: this.MODEL_NAME,
                embeddingModel: this.ragConfig.embeddingModel,
                contextWindow: this.CONTEXT_WINDOW,
            },
            'CoreAIService initialized with Gemini 2.0 Flash and AI SDK v5'
        )
    }

    /**
     * Main chat interface - handles everything automatically with retry logic
     *
     * This replaces the old two-step process:
     * 1. OLD: intentService.classifyIntent() + aiService.generateResponse()
     * 2. NEW: Just call chat() - AI SDK handles tool selection automatically
     *
     * @param context - Conversation context
     * @param tools - AI SDK tools (ISP tools, etc.)
     * @param retryCount - Internal retry counter (default: 0)
     * @returns AI response with metadata
     */
    async chat(context: ConversationContext, tools?: Record<string, any>, retryCount = 0): Promise<AIResponse> {
        const startTime = Date.now()
        const maxRetries = 3
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000) // Exponential backoff, max 10s

        try {
            // 1. Retrieve RAG context if enabled
            let ragContext: string | undefined
            if (this.ragConfig.enabled) {
                ragContext = await this.retrieveRAGContext(context.contextId, context.recentMessages[0]?.content || '')
            }

            // 2. Generate system prompt with RAG and personality
            const systemPrompt = this.generateSystemPrompt(context, ragContext)

            // 3. Reconstruct conversation history with tool calls
            const conversationHistory = await messageService.reconstructConversationHistory(
                context.contextId,
                context.recentMessages.length
            )

            // 4. Prepare messages for AI
            const messages: any[] = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: context.recentMessages[0]?.content || '' },
            ]

            // 5. Token budget monitoring
            const tokenBudget = this.calculateTokenBudget(systemPrompt, conversationHistory, context.recentMessages[0]?.content || '')

            if (tokenBudget.totalInputTokens > this.CONTEXT_WINDOW * 0.8) {
                aiLogger.warn(
                    {
                        contextId: context.contextId,
                        totalInputTokens: tokenBudget.totalInputTokens,
                        budgetUsagePercent: tokenBudget.usagePercent,
                    },
                    '⚠️  Approaching context window limit (>80%)'
                )
            }

            // 6. Generate response with tools (AI SDK automatically selects tools based on user message)
            const result = await generateText({
                model: this.model,
                messages,
                tools: tools || {},
                stopWhen: stepCountIs(5), // AI SDK v5: Replace maxSteps with stopWhen
                maxOutputTokens: this.MAX_TOKENS_PER_RESPONSE,
                maxRetries: 2, // AI SDK built-in retry for API failures
                temperature: 0, // AI SDK best practice: Use temperature 0 for deterministic tool calling
                experimental_context: {
                    userPhone: context.userPhone,
                    contextId: context.contextId,
                    userName: context.userName,
                    personality: context.personality,
                    userMessage: context.recentMessages[0]?.content || '',
                },
                onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
                    if (toolCalls && toolCalls.length > 1) {
                        aiLogger.info(
                            {
                                contextId: context.contextId,
                                toolCallCount: toolCalls.length,
                                toolNames: toolCalls.map((tc) => tc.toolName),
                            },
                            'Multiple tool calls in single step'
                        )
                    }

                    aiLogger.debug(
                        {
                            contextId: context.contextId,
                            toolCallCount: toolCalls?.length || 0,
                            finishReason,
                            tokensUsed: usage.totalTokens,
                        },
                        'AI step finished'
                    )
                },
            })

            const responseTimeMs = Date.now() - startTime

            // 7. Store AI response with tools
            await messageService.storeAIResponseWithTools(context.contextId, context.userPhone, result)

            // 8. Extract direct tool message if available (bypass AI commentary)
            let finalText = result.text
            let multipleMessages: string[] | undefined
            if (result.toolResults && result.toolResults.length > 0) {
                // Check if any tool returned a 'message' field or multiple messages
                for (const toolResult of result.toolResults) {
                    // Type assertion for tool result - AI SDK doesn't expose the result type properly
                    const resultData = toolResult as any
                    if (resultData.result && typeof resultData.result === 'object') {
                        // Check for multiple messages (e.g., multiple user search results)
                        if ('messages' in resultData.result && Array.isArray(resultData.result.messages)) {
                            multipleMessages = resultData.result.messages
                            finalText = resultData.result.messages[0] // First message as fallback
                            aiLogger.info(
                                {
                                    contextId: context.contextId,
                                    toolName: toolResult.toolName,
                                    messageCount: resultData.result.messages.length,
                                },
                                'Tool returned multiple messages'
                            )
                            break
                        }
                        // Check for single message
                        else if ('message' in resultData.result) {
                            // Use the tool's message directly instead of AI's text
                            finalText = resultData.result.message
                            aiLogger.info(
                                {
                                    contextId: context.contextId,
                                    toolName: toolResult.toolName,
                                },
                                'Using direct tool message instead of AI text'
                            )
                            break // Use first tool message found
                        }
                    }
                }
            }

            // 9. Log metrics
            if (result.toolCalls && result.toolCalls.length > 0) {
                aiLogger.info(
                    {
                        contextId: context.contextId,
                        userPhone: context.userPhone,
                        toolCalls: result.toolCalls.map((tc) => ({
                            toolName: tc.toolName,
                            input: (tc as any).args,
                        })),
                        steps: result.steps?.length,
                        responseTimeMs,
                        tokensUsed: result.usage?.totalTokens,
                        retries: retryCount,
                    },
                    'Chat response with tool calls'
                )
            } else {
                aiLogger.info(
                    {
                        contextId: context.contextId,
                        responseTimeMs,
                        tokensUsed: result.usage?.totalTokens,
                        ragEnabled: !!ragContext,
                        retries: retryCount,
                    },
                    'Chat response without tool calls'
                )
            }

            return {
                text: finalText, // Use direct tool message if available, otherwise AI text
                toolCalls: result.toolCalls,
                toolResults: result.toolResults,
                steps: result.steps,
                tokensUsed: result.usage?.totalTokens,
                responseTimeMs,
                multipleMessages, // Include multiple messages if available
            }
        } catch (error) {
            // AI SDK v5 Specific Error Handling
            if (APICallError.isInstance(error)) {
                // API failures - retry with exponential backoff
                const errorDetails = {
                    statusCode: error.statusCode,
                    responseBody: error.responseBody,
                    url: error.url,
                    cause: error.cause,
                }

                aiLogger.error(
                    { err: error, contextId: context.contextId, ...errorDetails, retryCount },
                    'API call failed'
                )

                // Retry on 5xx errors or rate limits (429)
                if (retryCount < maxRetries && (error.statusCode >= 500 || error.statusCode === 429)) {
                    aiLogger.info({ contextId: context.contextId, retryCount: retryCount + 1, retryDelay }, 'Retrying after API failure')
                    await new Promise(resolve => setTimeout(resolve, retryDelay))
                    return this.chat(context, tools, retryCount + 1)
                }

                throw new CoreAIServiceError(
                    `API call failed: ${error.message}`,
                    'API_CALL_ERROR',
                    error,
                    error.statusCode >= 500 || error.statusCode === 429
                )
            }

            if (NoSuchToolError.isInstance(error)) {
                // Model tried to call non-existent tool
                aiLogger.error(
                    { err: error, contextId: context.contextId, toolName: error.toolName },
                    'Model called non-existent tool'
                )

                throw new CoreAIServiceError(
                    `AI tried to use unknown tool: ${error.toolName}`,
                    'NO_SUCH_TOOL',
                    error,
                    false
                )
            }

            if (InvalidToolInputError.isInstance(error)) {
                // Tool inputs don't match schema
                aiLogger.error(
                    { err: error, contextId: context.contextId, toolName: error.toolName },
                    'Invalid tool inputs'
                )

                throw new CoreAIServiceError(
                    `Invalid inputs for tool ${error.toolName}`,
                    'INVALID_TOOL_INPUT',
                    error,
                    false
                )
            }

            if (NoContentGeneratedError.isInstance(error)) {
                // No content generated (rare)
                aiLogger.error({ err: error, contextId: context.contextId }, 'No content generated')

                throw new CoreAIServiceError(
                    'AI did not generate any content',
                    'NO_CONTENT_GENERATED',
                    error,
                    true // Can retry
                )
            }

            if (TypeValidationError.isInstance(error)) {
                // Schema validation failed
                aiLogger.error(
                    { err: error, contextId: context.contextId, value: error.value },
                    'Type validation failed'
                )

                throw new CoreAIServiceError(
                    'Generated content failed validation',
                    'TYPE_VALIDATION_ERROR',
                    error,
                    false
                )
            }

            if (InvalidArgumentError.isInstance(error)) {
                // Invalid arguments to AI SDK function
                aiLogger.error(
                    { err: error, contextId: context.contextId, parameter: error.parameter },
                    'Invalid arguments'
                )

                throw new CoreAIServiceError(
                    `Invalid argument: ${error.parameter}`,
                    'INVALID_ARGUMENT',
                    error,
                    false
                )
            }

            if (RetryError.isInstance(error)) {
                // All retries exhausted
                aiLogger.error(
                    { err: error, contextId: context.contextId, retries: error.errors.length },
                    'All retries exhausted'
                )

                throw new CoreAIServiceError(
                    'AI generation failed after all retries',
                    'RETRY_EXHAUSTED',
                    error,
                    false
                )
            }

            // Unknown error - log and rethrow
            aiLogger.error({ err: error, contextId: context.contextId, retryCount }, 'Chat failed with unknown error')

            throw new CoreAIServiceError(
                'Unexpected error during AI generation',
                'UNKNOWN_ERROR',
                error,
                false
            )
        }
    }

    /**
     * Generate enhanced system prompt with personality, RAG, and tool instructions
     */
    private generateSystemPrompt(context: ConversationContext, ragContext?: string): string {
        const { personality, userPhone } = context

        // Calculate today's date in user's timezone
        const now = new Date()
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: personality.default_timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        const parts = formatter.formatToParts(now)
        const year = parts.find((p) => p.type === 'year')?.value || ''
        const month = parts.find((p) => p.type === 'month')?.value || ''
        const day = parts.find((p) => p.type === 'day')?.value || ''
        const todayLocal = `${year}-${month}-${day}`

        const basePrompt = `⏰ CURRENT DATE: <b>${todayLocal}</b> (${personality.default_timezone} timezone)

You are ${personality.bot_name}, an intelligent ISP support assistant.

🎯 YOUR ROLE:
- Provide excellent ISP customer support
- Use tools to fetch real-time customer data
- Answer questions about accounts, billing, and technical issues
- Be helpful, accurate, and professional

🔧 AVAILABLE TOOLS:
1. searchCustomer - Look up customer by phone number or username
2. getMikrotikUsers - List all users on a Mikrotik interface with online/offline status
3. updateUserLocation - Update single user's location coordinates
4. batchUpdateLocations - Update multiple users' locations at once

📋 WHEN TO USE TOOLS (CRITICAL):
- User says "check dimetrejradi" → CALL searchCustomer(identifier: "dimetrejradi")
- User says "check +1234567890" → CALL searchCustomer(identifier: "+1234567890")
- User asks "show me info for john_doe" → CALL searchCustomer(identifier: "john_doe")
- User asks about account status → CALL searchCustomer with their identifier
- User mentions ANY phone number or username → CALL searchCustomer immediately
- User asks about users on interface/router → CALL getMikrotikUsers with interface name
- User provides location coordinates → CALL updateUserLocation or batchUpdateLocations

⚠️ TOOL USAGE RULES:
- When user provides identifier/phone/username, ALWAYS call searchCustomer tool FIRST
- Do NOT make up responses about "service being disabled" or "cannot find user"
- Call tools IMMEDIATELY without asking for confirmation
- When a tool returns a message, you can output it directly or add helpful context
- Handle errors gracefully with user-friendly messages

💬 MESSAGE FORMATTING (CRITICAL):
Use HTML formatting in ALL responses (messages are sent with parse_mode='HTML'):
- Bold: <b>text</b> - Use for headings, important info
- Italic: <i>text</i> - Use for emphasis, notes
- Code: <code>text</code> - Use for IPs, usernames, numbers
- Underline: <u>text</u> - Use sparingly for emphasis
- Links: <a href="url">text</a> - Use for URLs
- NEVER use markdown syntax (**bold**, *italic*, etc.) - it will show as plain text!
- Always escape user data with HTML entities if it contains <, >, &
- Emojis work without escaping (✅ 🟢 🔴 etc.)

EXAMPLES:
✅ CORRECT: "User <b>John Doe</b> is <code>online</code>"
❌ WRONG: "User **John Doe** is \`online\`" (will show as literal text)

📋 GUIDELINES:
- Language: ${personality.default_language}
- Timezone: ${personality.default_timezone}
- Be concise but thorough
- Use emojis for better readability
- Provide specific information when available
- Format responses with HTML tags for proper display`

        // Add RAG context if available
        if (ragContext) {
            return `${basePrompt}

=== SEMANTIC MEMORY (RAG) ===
The following context was retrieved from our conversation history:

${ragContext}

Use this context to provide personalized responses that reference our actual conversations.
===========================`
        }

        return basePrompt
    }

    /**
     * Retrieve relevant context using RAG with AI SDK v5 native embeddings
     */
    private async retrieveRAGContext(contextId: string, query: string): Promise<string | undefined> {
        try {
            // Check if context has embeddings
            const hasEmbeddings = await embeddingRepository.hasEmbeddings(contextId)
            if (!hasEmbeddings) {
                aiLogger.debug({ contextId }, 'No embeddings found for RAG')
                return undefined
            }

            // Generate query embedding using AI SDK v5 native embed()
            const { embedding: queryEmbedding } = await embed({
                model: this.embeddingModel,
                value: query,
                maxRetries: 2,
            })

            // Perform similarity search
            const searchResults = await embeddingRepository.similaritySearch({
                query_embedding: queryEmbedding,
                context_id: contextId,
                top_k: this.ragConfig.topK,
                min_similarity: this.ragConfig.minSimilarity,
            })

            if (searchResults.length === 0) {
                return undefined
            }

            // Format results
            const contextText = this.formatRAGContext(searchResults)

            aiLogger.debug(
                {
                    contextId,
                    chunksRetrieved: searchResults.length,
                    avgSimilarity: (
                        searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length
                    ).toFixed(3),
                },
                'RAG context retrieved with AI SDK v5 embeddings'
            )

            return contextText
        } catch (error) {
            aiLogger.error({ err: error, contextId }, 'RAG retrieval failed')
            return undefined // Fail gracefully
        }
    }

    /**
     * Format RAG search results as context
     */
    private formatRAGContext(searchResults: SimilaritySearchResult[]): string {
        return searchResults
            .map((result, index) => {
                const relevanceScore = (result.similarity * 100).toFixed(1)
                return `[Context ${index + 1} - ${relevanceScore}% relevant]\n${result.embedding.chunk_text}`
            })
            .join('\n\n')
    }

    /**
     * Calculate token budget (simplified - TokenCounter utility removed)
     */
    private calculateTokenBudget(systemPrompt: string, history: any[], userMessage: string) {
        // Simple estimation: ~4 characters per token
        const estimateTokens = (text: string) => Math.ceil(text.length / 4)

        const systemTokens = estimateTokens(systemPrompt)
        const historyText = history.map((m) => JSON.stringify(m.content)).join('\n')
        const historyTokens = estimateTokens(historyText)
        const userMessageTokens = estimateTokens(userMessage)
        const totalInputTokens = systemTokens + historyTokens + userMessageTokens
        const usagePercent = ((totalInputTokens / this.CONTEXT_WINDOW) * 100).toFixed(1)

        return {
            systemTokens,
            historyTokens,
            userMessageTokens,
            totalInputTokens,
            usagePercent,
        }
    }

    /**
     * Embed and store conversation chunks using AI SDK v5 native embeddings
     * Called by background worker
     */
    async embedConversationChunk(contextId: string, messages: Message[]): Promise<void> {
        if (messages.length === 0) {
            return
        }

        try {
            const chunkOptions: ChunkOptions = {
                chunkSize: this.ragConfig.chunkSize,
                overlap: this.ragConfig.chunkOverlap,
            }

            const chunks = TextChunker.chunkMessages(messages, chunkOptions)
            const latestIndex = await embeddingRepository.getLatestChunkIndex(contextId)

            for (const chunk of chunks) {
                // Generate embedding using AI SDK v5 native embed()
                const { embedding } = await embed({
                    model: this.embeddingModel,
                    value: chunk.chunkText,
                    maxRetries: 2,
                })

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
            }

            aiLogger.info(
                { contextId, chunksStored: chunks.length },
                'Conversation chunks embedded with AI SDK v5'
            )
        } catch (error) {
            aiLogger.error({ err: error, contextId }, 'Failed to embed conversation chunk')
            throw error
        }
    }

    /**
     * Process unembedded messages for a context (called by background worker)
     */
    async processUnembeddedMessages(contextId: string): Promise<number> {
        try {
            const stats = await embeddingRepository.getStats(contextId)
            const lastEmbeddedTime = stats.latest_timestamp || new Date(0)

            const unembeddedMessages = await messageService.getConversationHistory(contextId, 1000, 0)
            const messagesToEmbed = unembeddedMessages.filter(
                (msg) => new Date(msg.created_at) > lastEmbeddedTime && msg.content
            )

            if (messagesToEmbed.length === 0) {
                return 0
            }

            await this.embedConversationChunk(contextId, messagesToEmbed)
            return messagesToEmbed.length
        } catch (error) {
            aiLogger.error({ err: error, contextId }, 'Failed to process unembedded messages')
            throw error
        }
    }

    /**
     * Get RAG configuration
     */
    getRAGConfig(): RAGConfig {
        return { ...this.ragConfig }
    }

    /**
     * Update RAG configuration
     */
    updateRAGConfig(newConfig: Partial<RAGConfig>): void {
        this.ragConfig = { ...this.ragConfig, ...newConfig }
        aiLogger.info({ ragConfig: this.ragConfig }, 'RAG configuration updated')
    }

    /**
     * Check if context has embeddings
     */
    async hasEmbeddings(contextId: string): Promise<boolean> {
        return await embeddingRepository.hasEmbeddings(contextId)
    }

    /**
     * Delete all embeddings for a context (GDPR compliance)
     */
    async deleteEmbeddings(contextId: string): Promise<number> {
        aiLogger.info({ contextId }, 'Deleting embeddings')
        return await embeddingRepository.deleteByContextId(contextId)
    }
}

/**
 * Singleton instance
 */
export const coreAIService = new CoreAIService()
