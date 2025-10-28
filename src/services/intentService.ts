import { z } from 'zod'
import { ChatOpenAI } from '@langchain/openai'
import { env } from '~/config/env'
import { Message } from '~/database/schemas/message'

// Define intent categories for ISP Support bot
const intentSchema = z.object({
    intention: z
        .enum([
            'USER_INFO', // User asking for information about a phone number/customer
            'ACCOUNT_STATUS', // User asking about account status, online status, etc.
            'TECHNICAL_SUPPORT', // User asking about connection issues, IP, MAC address, etc.
            'BILLING_QUERY', // User asking about billing, account price, expiry, etc.
            'NETWORK_INFO', // User asking about network speeds, AP info, etc.
            'CUSTOMER_SEARCH', // User trying to find/search for a customer
            'GREETING', // Simple greeting
            'APPRECIATION', // Expressing thanks or gratitude
            'HELP', // User needs help/guidance
            'UNKNOWN', // Cannot determine intent
        ])
        .describe('Categorize the user message into one of these intentions'),
    confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('Confidence level of the intent classification (0-1)'),
})

export type IntentClassification = z.infer<typeof intentSchema>

export class IntentService {
    private openAI: ChatOpenAI

    constructor() {
        this.openAI = new ChatOpenAI({
            modelName: 'gpt-4o-mini', // Cost-effective and fast
            openAIApiKey: env.OPENAI_API_KEY,
            temperature: 0.3, // Lower temperature for more consistent classification
        })
    }

    /**
     * Classify user message intent using Langchain structured output
     */
    async classifyIntent(
        userMessage: string,
        conversationHistory: Message[] = []
    ): Promise<IntentClassification> {
        try {
            // Build conversation history context
            const historyContext = this.buildHistoryContext(conversationHistory)

            // Create structured output with Langchain
            const llmWithStructuredOutput = this.openAI.withStructuredOutput(intentSchema, {
                name: 'IntentClassification',
            })

            // Prepare the prompt
            const prompt = this.buildClassificationPrompt(userMessage, historyContext)

            // Classify intent
            const result = await llmWithStructuredOutput.invoke(prompt)

            console.log(
                `🎯 Intent classified: ${result.intention} (confidence: ${Math.round(result.confidence * 100)}%)`
            )

            return result
        } catch (error) {
            console.error('❌ Error classifying intent:', error)
            // Return UNKNOWN intent on error
            return {
                intention: 'UNKNOWN',
                confidence: 0,
            }
        }
    }

    /**
     * Build conversation history context for better classification
     */
    private buildHistoryContext(messages: Message[]): string {
        if (messages.length === 0) {
            return 'No previous conversation history.'
        }

        const recent = messages.slice(-5) // Last 5 messages
        const context = recent
            .map((msg) => {
                const role = msg.direction === 'incoming' ? 'User' : 'Assistant'
                return `${role}: ${msg.content || ''}`
            })
            .join('\n')

        return `Recent conversation:\n${context}`
    }

    /**
     * Build classification prompt
     */
    private buildClassificationPrompt(userMessage: string, historyContext: string): string {
        return `You are an intent classification system for an ISP Support bot.

Context: This is an ISP (Internet Service Provider) support chatbot that helps staff retrieve customer information, check account status, and provide technical support.

${historyContext}

Current user message: "${userMessage}"

Classify the user's intention into ONE of these categories:

1. USER_INFO - User wants to retrieve information about a customer using their phone number
   Examples: "Check phone number +1234567890", "Get info for 555-1234", "Show customer details for +961123456"

2. ACCOUNT_STATUS - User asking about account status, online status, or activation
   Examples: "Is customer +1234567890 online?", "Check account status for 555-1234", "Is this account active?"

3. TECHNICAL_SUPPORT - User asking about technical details like IP, MAC address, connection issues
   Examples: "What's the IP for customer +1234567890?", "Check MAC address", "Connection issues for 555-1234"

4. BILLING_QUERY - User asking about billing, account price, expiry dates, discounts
   Examples: "Check billing for +1234567890", "When does account expire?", "What's the price for 555-1234?"

5. NETWORK_INFO - User asking about network speeds, access points, NAS hosts
   Examples: "What are the speeds for +1234567890?", "Check AP status", "Network info for 555-1234"

6. CUSTOMER_SEARCH - User trying to find/search for a customer by name or partial info
   Examples: "Find customer John Doe", "Search for users", "Look up customer"

7. GREETING - Simple greeting without specific intent
   Examples: "Hello", "Hi", "Good morning", "Hey there", "Hey"

8. APPRECIATION - Expressing thanks or gratitude
   Examples: "Thanks", "Thank you", "Appreciate it", "Thanks a lot", "Thx", "Perfect, thanks"

9. HELP - User needs help or guidance
   Examples: "How do I use this?", "Help", "What can you do?", "Show me commands"

10. UNKNOWN - Cannot determine clear intent

Provide:
- intention: The classified category
- confidence: Your confidence level (0-1)`
    }

    /**
     * Quick check if message is likely asking for user info (for fast routing)
     */
    isLikelyUserInfo(message: string): boolean {
        const userInfoKeywords = [
            'phone number',
            'check',
            'get info',
            'customer',
            'details',
            'information',
            'lookup',
            'search',
        ]
        const lowerMessage = message.toLowerCase()
        return userInfoKeywords.some((keyword) => lowerMessage.includes(keyword))
    }

    /**
     * Quick check if message contains a phone number (for fast routing)
     */
    containsPhoneNumber(message: string): boolean {
        // Match various phone number formats
        const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/
        return phoneRegex.test(message)
    }

    /**
     * Extract phone number from message
     */
    extractPhoneNumber(message: string): string | null {
        // Clean the message first - normalize spaces and remove common separators
        const cleanMessage = message.replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()

        // Enhanced patterns for phone numbers in natural language (including spaced formats)
        const phonePatterns = [
            // Numbers with spaces: +961 71 534 710, 961 71 534 710, 71 534 710
            /\b(?:\+?961\s?)?\d{1,2}(?:\s?\d{3}){1,2}(?:\s?\d{2,3})\b/g,
            // Standalone numbers: 71534710, +96171534710, 96171534710
            /\b(\+?\d{8,15})\b/g,
            // Numbers with context: phone number 71534710, number: 71-534-710, mobile: +961 71 534 710
            /(?:phone|number|mobile|contact)\s*[:-]?\s*((?:\+?961\s?)?\d{1,2}(?:\s?\d{3}){1,2}(?:\s?\d{2,3})|\+?\d{8,15})/gi,
            // After common phrases: for 71534710, for +961 71 534 710, at 71 534 710
            /(?:for|at|to)\s+((?:\+?961\s?)?\d{1,2}(?:\s?\d{3}){1,2}(?:\s?\d{2,3})|\+?\d{8,15})\b/gi,
        ]

        // Try to find phone numbers in the message
        for (const pattern of phonePatterns) {
            const matches = cleanMessage.match(pattern)
            if (matches) {
                for (const match of matches) {
                    // Extract just the number part and clean it
                    const phoneNumber = match.replace(/[^\d+]/g, '')

                    // Skip if it's too short or too long
                    if (phoneNumber.length < 6 || phoneNumber.length > 15) continue

                    // For international formatting consistency
                    if (!phoneNumber.startsWith('+') && phoneNumber.length >= 10) {
                        // If it looks like an international number but missing +, add it
                        if (phoneNumber.length > 10 && !phoneNumber.startsWith('00')) {
                            phoneNumber = '+' + phoneNumber
                        }
                    }

                    return phoneNumber
                }
            }
        }

        // Fallback: Try simple extraction for edge cases
        const simpleNumberMatch = cleanMessage.match(/\b\d{6,15}\b/)
        if (simpleNumberMatch) {
            let phoneNumber = simpleNumberMatch[0]
            if (!phoneNumber.startsWith('+') && phoneNumber.length > 10 && !phoneNumber.startsWith('00')) {
                phoneNumber = '+' + phoneNumber
            }
            return phoneNumber
        }

        return null
    }
}

// Export singleton instance
export const intentService = new IntentService()
