import { ChatMessage } from '~/services/aiService'
import { Message } from '~/database/schemas/message'

/**
 * Token counting utilities for managing LLM context windows
 *
 * NOTE: This is a ROUGH APPROXIMATION. For exact counts, use tiktoken library.
 * For our use case (managing context), approximations are sufficient.
 */
export class TokenCounter {
    // Rough approximations based on OpenAI's guidelines
    private static readonly CHARS_PER_TOKEN = 4
    private static readonly TOKENS_PER_MESSAGE_OVERHEAD = 4 // Role, name, padding
    private static readonly SYSTEM_PROMPT_OVERHEAD = 10 // Additional tokens for system prompt

    /**
     * Estimate tokens for a text string
     * Uses 1 token ≈ 4 characters approximation
     */
    static estimateTextTokens(text: string): number {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN)
    }

    /**
     * Estimate tokens for a chat message
     * Includes overhead for role, content, and formatting
     */
    static estimateChatMessageTokens(message: ChatMessage): number {
        const contentTokens = this.estimateTextTokens(message.content)
        return contentTokens + this.TOKENS_PER_MESSAGE_OVERHEAD
    }

    /**
     * Estimate total tokens for an array of chat messages
     */
    static estimateChatMessagesTokens(messages: ChatMessage[]): number {
        return messages.reduce((total, msg) => total + this.estimateChatMessageTokens(msg), 0)
    }

    /**
     * Estimate tokens for a database message
     */
    static estimateMessageTokens(message: Message): number {
        if (!message.content) return this.TOKENS_PER_MESSAGE_OVERHEAD

        const contentTokens = this.estimateTextTokens(message.content)
        return contentTokens + this.TOKENS_PER_MESSAGE_OVERHEAD
    }

    /**
     * Estimate total tokens for an array of database messages
     */
    static estimateMessagesTokens(messages: Message[]): number {
        return messages.reduce((total, msg) => total + this.estimateMessageTokens(msg), 0)
    }

    /**
     * Fit messages into a token budget
     * Returns as many recent messages as will fit
     *
     * @param messages - Messages in chronological order (oldest first)
     * @param maxTokens - Maximum token budget
     * @param systemPromptTokens - Tokens reserved for system prompt
     * @returns Messages that fit within budget (most recent first)
     */
    static fitMessagesInBudget(messages: Message[], maxTokens: number, systemPromptTokens = 0): Message[] {
        const availableTokens = maxTokens - systemPromptTokens - this.SYSTEM_PROMPT_OVERHEAD
        const fitted: Message[] = []
        let currentTokens = 0

        // Process messages in reverse (most recent first)
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i]
            const messageTokens = this.estimateMessageTokens(message)

            if (currentTokens + messageTokens <= availableTokens) {
                fitted.unshift(message) // Add to start to maintain chronological order
                currentTokens += messageTokens
            } else {
                break // No more room
            }
        }

        return fitted
    }

    /**
     * Fit chat messages into a token budget
     * Similar to fitMessagesInBudget but for ChatMessage type
     */
    static fitChatMessagesInBudget(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
        const fitted: ChatMessage[] = []
        let currentTokens = 0

        // Process messages in reverse (most recent first)
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i]
            const messageTokens = this.estimateChatMessageTokens(message)

            if (currentTokens + messageTokens <= maxTokens) {
                fitted.unshift(message)
                currentTokens += messageTokens
            } else {
                break
            }
        }

        return fitted
    }

    /**
     * Calculate remaining token budget
     */
    static calculateRemainingTokens(
        usedMessages: Message[],
        systemPrompt: string,
        contextWindow: number
    ): number {
        const messageTokens = this.estimateMessagesTokens(usedMessages)
        const systemTokens = this.estimateTextTokens(systemPrompt) + this.SYSTEM_PROMPT_OVERHEAD
        const used = messageTokens + systemTokens

        return Math.max(0, contextWindow - used)
    }

    /**
     * Check if adding a message would exceed token budget
     */
    static wouldExceedBudget(currentMessages: Message[], newMessage: Message, maxTokens: number): boolean {
        const currentTokens = this.estimateMessagesTokens(currentMessages)
        const newTokens = this.estimateMessageTokens(newMessage)

        return currentTokens + newTokens > maxTokens
    }

    /**
     * Get token statistics for messages
     */
    static getTokenStats(messages: Message[]): {
        totalTokens: number
        avgTokensPerMessage: number
        minTokens: number
        maxTokens: number
    } {
        if (messages.length === 0) {
            return { totalTokens: 0, avgTokensPerMessage: 0, minTokens: 0, maxTokens: 0 }
        }

        const tokenCounts = messages.map((msg) => this.estimateMessageTokens(msg))
        const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0)
        const avgTokensPerMessage = totalTokens / messages.length
        const minTokens = Math.min(...tokenCounts)
        const maxTokens = Math.max(...tokenCounts)

        return {
            totalTokens,
            avgTokensPerMessage,
            minTokens,
            maxTokens,
        }
    }

    /**
     * Truncate text to fit within token budget
     * Useful for long messages
     */
    static truncateText(text: string, maxTokens: number): string {
        const maxChars = maxTokens * this.CHARS_PER_TOKEN
        if (text.length <= maxChars) return text

        return text.substring(0, maxChars) + '...'
    }

    /**
     * Get context window limits for different models
     */
    static getModelContextWindow(model: string): number {
        const contextWindows: Record<string, number> = {
            'gpt-4o-mini': 128000,
            'gpt-4o': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4': 8192,
            'gpt-3.5-turbo': 16385,
            'gpt-3.5-turbo-16k': 16385,
        }

        return contextWindows[model] ?? 8192 // Default to conservative estimate
    }

    /**
     * Calculate safe context window (leaving room for response)
     * Typically reserve 25-30% for the response
     */
    static getSafeContextWindow(model: string, responseTokens = 2000): number {
        const fullWindow = this.getModelContextWindow(model)
        return fullWindow - responseTokens
    }

    /**
     * Pretty print token statistics
     */
    static formatTokenStats(stats: ReturnType<typeof TokenCounter.getTokenStats>): string {
        return `Total: ${stats.totalTokens} tokens | Avg: ${Math.round(stats.avgTokensPerMessage)} | Range: ${stats.minTokens}-${stats.maxTokens}`
    }
}
