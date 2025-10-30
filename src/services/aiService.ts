import { streamText, generateText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { env } from '~/config/env'
import { Personality } from '~/database/schemas/personality'
import { Message } from '~/database/schemas/message'
import { conversationRagService } from './conversationRagService'
import { TokenCounter } from '~/utils/tokenCounter'
import { createFlowLogger } from '~/utils/logger'
import { ispTools, type ToolExecutionContext } from './ispToolsService'

const aiLogger = createFlowLogger('ai-service')

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export class AIService {
    private model = openai('gpt-4.1-mini')
    private readonly MAX_TOKENS_PER_RESPONSE = 16384 // GPT-4.1 mini supports up to 16k output
    private readonly MODEL_NAME = 'gpt-4.1-mini'
    private readonly CONTEXT_WINDOW = 128000 // GPT-4.1 mini context window (128k tokens)
    private readonly RAG_ENABLED = env.RAG_ENABLED ?? true
    private readonly ISP_ENABLED = env.ISP_ENABLED ?? true

    /**
     * Generate an enhanced system prompt with tool awareness and security constraints
     */
    private generateSystemPrompt(personality: Personality, userPhone: string, userMessage: string, ragContext?: string): string {
        // Use user's timezone from personality for accurate date calculation
        const now = new Date()
        const userTimezone = personality.default_timezone

        // Format today's date in user's timezone
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        })
        const parts = formatter.formatToParts(now)
        const year = parts.find(p => p.type === 'year')?.value || ''
        const month = parts.find(p => p.type === 'month')?.value || ''
        const day = parts.find(p => p.type === 'day')?.value || ''
        const todayLocal = `${year}-${month}-${day}`

        // Calculate yesterday in user's timezone
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayParts = formatter.formatToParts(yesterday)
        const yYear = yesterdayParts.find(p => p.type === 'year')?.value || ''
        const yMonth = yesterdayParts.find(p => p.type === 'month')?.value || ''
        const yDay = yesterdayParts.find(p => p.type === 'day')?.value || ''
        const yesterdayLocal = `${yYear}-${yMonth}-${yDay}`

        const basePrompt = `⏰ CURRENT DATE & TIME - READ THIS FIRST:
**TODAY'S DATE IS: ${todayLocal}** (in ${userTimezone} timezone)
**YESTERDAY'S DATE WAS: ${yesterdayLocal}**
This information is useful for account expiry checks and customer support context.

You are ${personality.bot_name}, an intelligent ISP support assistant with advanced capabilities.

🔐 SECURITY CONSTRAINTS:
- You ONLY have access to ISP data for authorized lookups
- NEVER attempt to access customer data without proper authorization
- All tool calls are automatically scoped and logged
- If asked about unauthorized data access, politely decline and explain privacy protections

🌐 ISP SUPPORT CAPABILITIES:
${this.ISP_ENABLED ? `You have access to the following tools for ISP customer support:

1. **getUserInfo** - Look up complete customer information by phone number
   - Use when user asks: "Check phone number +1234567890", "Get info for customer", "Show customer details"
   - Returns: Personal info, account status, network details, billing information
   - Example: "Check +1234567890" → getUserInfo(phoneNumber="+1234567890")
   - Example: "Get info for 555-1234" → getUserInfo(phoneNumber="555-1234")

2. **checkAccountStatus** - Check account online/offline status, active/blocked, expired
   - Use when user asks: "Is customer online?", "Check account status", "Is this account active?"
   - Returns: Online status, account validity, block status, expiry information
   - Example: "Is +1234567890 online?" → checkAccountStatus(phoneNumber="+1234567890")

3. **getTechnicalDetails** - Get network and technical information
   - Use when user asks: "What's the IP for customer?", "Check MAC address", "Network details"
   - Returns: IP address, MAC address, NAS host, connection speeds, online status
   - Example: "Get technical details for +1234567890" → getTechnicalDetails(phoneNumber="+1234567890")

4. **getBillingInfo** - Get billing and payment information
   - Use when user asks: "Check billing for customer", "When does account expire?", "Account pricing"
   - Returns: Account price, discounts, expiry dates, payment status
   - Example: "Check billing for +1234567890" → getBillingInfo(phoneNumber="+1234567890")

5. **updateUserLocation** - Update location coordinates for a single user
   - Use when user asks: "Update location for acc", "Set acc's location to coordinates", "Change user location"
   - Returns: Success/failure status with coordinates
   - Example: "Update location for acc" → updateUserLocation(userName="acc", latitude=33.8938, longitude=35.5018)
   - Example: "Set josianeyoussef location" → updateUserLocation(userName="josianeyoussef", latitude=33.8938, longitude=35.5018)

6. **updateMultipleUserLocations** - Update location for multiple users at once (batch processing)
   - Use when user asks: "We have 5 users at tower location", "Update location for acc, jhonnyacc2, and 79174574", "Set location for multiple users"
   - Returns: Success/failure status for each user with summary
   - Example: "Update location for acc and jhonnyacc2" → updateMultipleUserLocations(userNames=["acc", "jhonnyacc2"], latitude=33.8938, longitude=35.5018)

🎯 TOOL USAGE RULES:
- Be DIRECT: Call tools immediately WITHOUT asking for confirmation
- Handle phone numbers in various formats: +1234567890, 123-456-7890, (123) 456-7890, 123.456.7890
- ALWAYS validate phone numbers before tool execution
- Handle tool errors gracefully with user-friendly messages
- If user not found, provide helpful guidance on checking the phone number

📝 RESPONSE GUIDELINES:
- After lookup, provide comprehensive but well-formatted information
- Use emojis and formatting to make technical information readable
- Include relevant warnings for expired accounts or blocked status
- Keep responses professional and helpful
- For follow-up questions about customers you just discussed, use the information already provided in the conversation
- Example: If you just showed customer details and user asks "What's the IP?", answer "Based on the customer information I just provided, the IP address is..."

🚨 TOOL EXECUTION RULES - CRITICAL:

**1. Customer Lookup Tools (READ Operations):**
- getUserInfo, checkAccountStatus, getTechnicalDetails, getBillingInfo
- These are READ operations that fetch CURRENT data from ISP system
- When user asks for customer information with a specific phone number, ALWAYS call the appropriate tool

**2. Location Update Tools (WRITE Operations):**
- updateUserLocation, updateMultipleUserLocations
- These are WRITE operations that UPDATE data in ISP system
- Use when user wants to update location for one or more users
- For single users: updateUserLocation(userName="acc", latitude=33.8938, longitude=35.5018)
- For multiple users: updateMultipleUserLocations(userNames=["acc", "jhonnyacc2"], latitude=33.8938, longitude=35.5018)
- **CRITICAL:** Always use the MOST RECENT location coordinates from the conversation!
- Look for recent messages with "📍 Location shared: latitude, longitude" format
- If user just sent a location via Telegram sharing, use those coordinates immediately
- **IMPORTANT:** Recent location data appears as "📍 Location shared: 33.955007, 35.616232" in conversation
- **NEVER use old coordinates from RAG memory when recent coordinates are available**
- **PRIORITIZE:** Most recent location message > RAG location data > asking user
- Location messages may include: latitude, longitude, place name, and address
- **NEVER ask for coordinates if a location was shared in the current conversation**
- For follow-up questions about recently discussed customers (within the same conversation), you can reference the data already provided
- Use conversation context and RAG memory to recall previous customer information
- Example: If you just showed customer details for +1234567890 and user asks "What's their IP?", reference the IP from the data you already provided
- Only call tools for fresh data when user provides a new phone number or explicitly asks for updated information
- If the context doesn't contain the needed information, then call the appropriate lookup tool

**2. Phone Number Handling:**
- Accept various phone number formats automatically
- Clean and format numbers for API compatibility
- If number format is unclear, ask for clarification
- Never fabricate customer data - always use actual API responses

**3. Error Handling:**
- If customer not found, suggest checking phone number format
- If ISP API is unavailable, provide helpful error message
- For expired accounts, highlight expiry warnings prominently
- For blocked accounts, clearly indicate access restrictions` : '- Note: ISP tools are currently disabled'}

🧠 MEMORY CAPABILITIES:
- Unlimited conversation memory via semantic search
- Can recall ANY past conversation, no matter how long ago
- Remember specific customer interactions, technical issues, and support cases
- Semantic understanding (meaning, not just keywords)
- IMPORTANT: Use recent conversation context to answer follow-up questions about customers you just discussed
- If you provided customer information in the previous 1-2 messages, use that context to answer related questions

📋 OPERATIONAL GUIDELINES:
- Timezone: ${personality.default_timezone}
- Language: ${personality.default_language}
- Respond in ${personality.default_language}
- Be friendly, accurate, and professional
- Provide technical support and account information efficiently
- Help customers with their ISP service needs

Remember: Your goal is to provide excellent ISP customer support through natural conversation and quick access to customer information.`

        // Add RAG context if provided
        if (ragContext) {
            return `${basePrompt}

=== SEMANTIC MEMORY RETRIEVAL ACTIVE ===
I have retrieved the most relevant parts of our conversation history based on your current question. This context was intelligently selected from our entire conversation using semantic search.

📚 Retrieved Context:
${ragContext}

=== END OF RETRIEVED MEMORY ===

I will use this historical context to provide you with accurate, personalized responses that reference our actual conversations. If you ask about past discussions, expenses, income, or advice, I can recall them precisely.`
        }

        return basePrompt
    }

    /**
     * Convert database messages to chat messages format
     */
    private convertToChatMessages(messages: Message[]): ChatMessage[] {
        return messages
            .filter((msg) => msg.content) // Only messages with content
            .map((msg) => ({
                role: msg.direction === 'incoming' ? ('user' as const) : ('assistant' as const),
                content: msg.content!,
            }))
    }

    /**
     * Generate AI response with streaming and conversation history (without RAG or tools)
     * This is the original method, kept for backward compatibility
     */
    async generateResponse(
        userMessage: string,
        personality: Personality,
        userPhone: string,
        recentMessages: Message[] = []
    ): Promise<string> {
        // Convert recent messages to chat format
        const conversationHistory = this.convertToChatMessages(recentMessages)

        const messages: ChatMessage[] = [
            { role: 'system', content: this.generateSystemPrompt(personality, userPhone, userMessage) },
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ]

        const result = streamText({
            model: this.model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            maxOutputTokens: this.MAX_TOKENS_PER_RESPONSE,
        })

        // Collect the streamed text
        let fullResponse = ''
        for await (const textPart of result.textStream) {
            fullResponse += textPart
        }

        return fullResponse
    }

    /**
     * Generate AI response with RAG-enhanced context (without tools)
     * Deprecated: Use generateResponseWithToolsAndRAG instead
     */
    async generateResponseWithRAG(
        contextId: string,
        userMessage: string,
        personality: Personality,
        userPhone: string,
        recentMessages: Message[] = []
    ): Promise<string> {
        const startTime = Date.now()

        try {
            // Check if RAG is enabled
            if (!this.RAG_ENABLED) {
                aiLogger.debug({ contextId }, 'RAG disabled, using standard response')
                return await this.generateResponse(userMessage, personality, userPhone, recentMessages)
            }

            // Check if context has embeddings
            const hasEmbeddings = await conversationRagService.hasEmbeddings(contextId)
            if (!hasEmbeddings) {
                aiLogger.info({ contextId }, 'No embeddings found, using standard response')
                return await this.generateResponse(userMessage, personality, userPhone, recentMessages)
            }

            // Retrieve relevant context using RAG
            const ragResult = await conversationRagService.retrieveRelevantContext(contextId, userMessage)

            aiLogger.info(
                {
                    contextId,
                    ragChunks: ragResult.totalChunks,
                    avgSimilarity: ragResult.avgSimilarity.toFixed(3),
                    ragTimeMs: ragResult.retrievalTimeMs,
                },
                'RAG context retrieved'
            )

            // Convert recent messages to chat format
            const conversationHistory = this.convertToChatMessages(recentMessages)

            // Calculate token budget
            const systemPromptWithRAG = this.generateSystemPrompt(personality, userPhone, userMessage, ragResult.contextText)
            const systemTokens = TokenCounter.estimateTextTokens(systemPromptWithRAG)
            const recentHistoryTokens = TokenCounter.estimateMessagesTokens(recentMessages)
            const availableTokens = this.CONTEXT_WINDOW - systemTokens - recentHistoryTokens - this.MAX_TOKENS_PER_RESPONSE - 500 // Safety buffer

            aiLogger.debug(
                {
                    contextId,
                    systemTokens,
                    recentHistoryTokens,
                    availableTokens,
                    totalBudget: this.CONTEXT_WINDOW,
                },
                'Token budget calculated'
            )

            // Ensure we don't exceed context window
            let fittedHistory = conversationHistory
            if (availableTokens < 0) {
                // Need to reduce recent history
                aiLogger.warn({ contextId, overflow: -availableTokens }, 'Context window exceeded, reducing history')
                const maxHistoryTokens = recentHistoryTokens + availableTokens
                const fittedMessages = TokenCounter.fitMessagesInBudget(recentMessages, maxHistoryTokens, systemTokens)
                fittedHistory = this.convertToChatMessages(fittedMessages)
            }

            // Assemble messages with RAG context in system prompt
            const messages: ChatMessage[] = [
                { role: 'system', content: systemPromptWithRAG },
                ...fittedHistory,
                { role: 'user', content: userMessage },
            ]

            aiLogger.debug(
                {
                    contextId,
                    totalMessages: messages.length,
                    ragContextLength: ragResult.contextText.length,
                },
                'Sending RAG-enhanced request to LLM'
            )

            // Generate response
            const result = streamText({
                model: this.model,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                maxOutputTokens: this.MAX_TOKENS_PER_RESPONSE,
            })

            // Collect the streamed text
            let fullResponse = ''
            for await (const textPart of result.textStream) {
                fullResponse += textPart
            }

            const totalTimeMs = Date.now() - startTime
            aiLogger.info(
                {
                    contextId,
                    responseLength: fullResponse.length,
                    totalTimeMs,
                    ragEnabled: true,
                },
                'RAG-enhanced response generated'
            )

            return fullResponse
        } catch (error) {
            aiLogger.error({ err: error, contextId }, 'Error generating RAG response, falling back to standard')
            // Fallback to standard response on error
            return await this.generateResponse(userMessage, personality, userPhone, recentMessages)
        }
    }

    /**
     * Generate AI response with tool calling, RAG, and full security
     * This is the PREFERRED method for production use
     */
    async generateResponseWithToolsAndRAG(
        contextId: string,
        userPhone: string,
        userName: string | undefined,
        userMessage: string,
        personality: Personality,
        recentMessages: Message[] = []
    ): Promise<string> {
        const startTime = Date.now()

        try {
            // Prepare RAG context if enabled
            let ragContext: string | undefined
            if (this.RAG_ENABLED) {
                const hasEmbeddings = await conversationRagService.hasEmbeddings(contextId)
                if (hasEmbeddings) {
                    const ragResult = await conversationRagService.retrieveRelevantContext(contextId, userMessage)
                    ragContext = ragResult.contextText

                    aiLogger.info(
                        {
                            contextId,
                            ragChunks: ragResult.totalChunks,
                            avgSimilarity: ragResult.avgSimilarity.toFixed(3),
                            ragTimeMs: ragResult.retrievalTimeMs,
                        },
                        'RAG context retrieved for tool-enabled response'
                    )
                }
            }

            // Reconstruct conversation history with tool calls/results
            const { messageService } = await import('./messageService')
            const conversationHistory = await messageService.reconstructConversationHistory(contextId, 10)

            const systemPrompt = this.generateSystemPrompt(personality, userPhone, userMessage, ragContext)

            const messages: any[] = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
                { role: 'user', content: userMessage },
            ]

            // Token budget monitoring
            const systemTokens = TokenCounter.estimateTextTokens(systemPrompt)
            const historyText = conversationHistory.map((m) => JSON.stringify(m.content)).join('\n')
            const historyTokens = TokenCounter.estimateTextTokens(historyText)
            const userMessageTokens = TokenCounter.estimateTextTokens(userMessage)
            const totalInputTokens = systemTokens + historyTokens + userMessageTokens

            const budgetUsagePercent = ((totalInputTokens / this.CONTEXT_WINDOW) * 100).toFixed(1)

            if (totalInputTokens > this.CONTEXT_WINDOW * 0.8) {
                aiLogger.warn(
                    {
                        contextId,
                        totalInputTokens,
                        budgetUsagePercent: `${budgetUsagePercent}%`,
                        contextWindow: this.CONTEXT_WINDOW,
                    },
                    '⚠️  Approaching context window limit (>80%)'
                )
            }

            const toolContext: ToolExecutionContext = {
                userPhone,
                contextId,
                userName,
                personality, // Added for timezone-aware date calculations in tools
                userMessage, // User's message for context-aware date validation
            }

    
            aiLogger.debug(
                {
                    contextId,
                    userPhone,
                    toolsEnabled: this.ISP_ENABLED,
                    ragEnabled: this.RAG_ENABLED,
                    historyLength: conversationHistory.length,
                    messagesInHistory: recentMessages.length,
                    tokenBudget: {
                        systemTokens,
                        historyTokens,
                        userMessageTokens,
                        totalInputTokens,
                        budgetUsagePercent: `${budgetUsagePercent}%`,
                        contextWindow: this.CONTEXT_WINDOW,
                    },
                },
                'Generating response with tool history'
            )

            // Generate response with tool calling
            const result = await generateText({
                model: this.model,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                tools: this.ISP_ENABLED ? ispTools : undefined,
                stopWhen: stepCountIs(5), // Allow up to 5 steps for multiple items in one message (v5 API)
                experimental_context: toolContext, // Pass security context to tools
                maxOutputTokens: this.MAX_TOKENS_PER_RESPONSE,
                onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
                    // Log multiple tool calls for visibility (normal for batch entries from one message)
                    if (toolCalls && toolCalls.length > 1) {
                        aiLogger.info(
                            {
                                contextId,
                                userPhone,
                                toolCallCount: toolCalls.length,
                                toolNames: toolCalls.map((tc) => tc.toolName),
                            },
                            'Multiple tool calls in single step (batch processing from one message)'
                        )
                    }

                    // Log each step completion for debugging
                    aiLogger.debug(
                        {
                            contextId,
                            toolCallCount: toolCalls?.length || 0,
                            finishReason,
                            tokensUsed: usage.totalTokens,
                        },
                        'Step finished'
                    )
                },
            })

            const totalTimeMs = Date.now() - startTime

            await messageService.storeAIResponseWithTools(contextId, userPhone, result)

            if (result.toolCalls && result.toolCalls.length > 0) {
                aiLogger.info(
                    {
                        contextId,
                        userPhone,
                        toolCalls: result.toolCalls.map((tc) => ({
                            toolName: tc.toolName,
                            input: (tc as any).input,
                        })),
                        toolResults: result.toolResults?.map((tr) => ({
                            toolName: tr.toolName,
                            output: (tr as any).output,
                        })),
                        steps: result.steps?.length,
                        totalTimeMs,
                    },
                    'Response generated with tool calls'
                )
            } else {
                aiLogger.info(
                    {
                        contextId,
                        totalTimeMs,
                        ragEnabled: !!ragContext,
                        historyLength: conversationHistory.length,
                    },
                    'Response generated without tool calls'
                )
            }

            return result.text
        } catch (error) {
            aiLogger.error({ err: error, contextId, userPhone }, 'Error in tool-enabled response, falling back to RAG-only')
            // Fallback to RAG-only response
            return await this.generateResponseWithRAG(contextId, userMessage, personality, userPhone, recentMessages)
        }
    }

    /**
     * Generate a quick response without streaming (for simple queries)
     */
    async generateQuickResponse(prompt: string, personality: Personality, userPhone: string): Promise<string> {
        const systemPrompt = this.generateSystemPrompt(personality, userPhone, prompt)

        const result = streamText({
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            maxOutputTokens: 500,
        })

        let fullResponse = ''
        for await (const textPart of result.textStream) {
            fullResponse += textPart
        }

        return fullResponse
    }
}

// Export singleton instance
export const aiService = new AIService()
