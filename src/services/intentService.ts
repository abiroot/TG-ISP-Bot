import { z } from 'zod'
import { ChatOpenAI } from '@langchain/openai'
import { env } from '~/config/env'
import { Message } from '~/database/schemas/message'
import { logger } from '~/utils/logger'

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

1. USER_INFO - User wants to retrieve information about a customer using their phone number or username
   Examples: "Check phone number +1234567890", "Get info for josianeyoussef", "Show customer details for john_doe", "Check user @username", "Info for 555-1234"

2. ACCOUNT_STATUS - User asking about account status, online status, or activation
   Examples: "Is customer +1234567890 online?", "Check account status for josianeyoussef", "Is username john_doe active?", "Status for 555-1234"

3. TECHNICAL_SUPPORT - User asking about technical details like IP, MAC address, connection issues
   Examples: "What's the IP for customer josianeyoussef?", "Check MAC address for john_doe", "Connection issues for +1234567890", "Technical details for 555-1234"

4. BILLING_QUERY - User asking about billing, account price, expiry dates, discounts
   Examples: "Check billing for josianeyoussef", "When does account for john_doe expire?", "What's the price for +1234567890?", "Billing info for 555-1234"

5. NETWORK_INFO - User asking about network speeds, access points, NAS hosts
   Examples: "What are the speeds for josianeyoussef?", "Check AP status for john_doe", "Network info for +1234567890", "Connection details for 555-1234"

6. CUSTOMER_SEARCH - User trying to find/search for a customer by name, username, or partial info
   Examples: "Find customer John Doe", "Search for user josianeyoussef", "Look up username john_doe", "Find users"

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
     * Quick check if message contains a user identifier (phone number or username)
     */
    containsUserIdentifier(message: string): boolean {
        // Check for phone numbers
        if (this.containsPhoneNumber(message)) return true

        // Check for usernames (@username, username references, etc.)
        const usernamePatterns = [
            /@[a-zA-Z][a-zA-Z0-9_.]{2,31}/g, // @username mentions
            /(?:user|username|account|customer)\s*[:-]?\s*[a-zA-Z][a-zA-Z0-9_.]{2,31}/gi, // user references
            /\b[a-zA-Z][a-zA-Z0-9_.]{2,31}\b(?!@\w)/g, // standalone usernames
        ]

        return usernamePatterns.some(pattern => pattern.test(message))
    }

    /**
     * Convert number words to digits
     */
    private convertNumberWordsToDigits(text: string): string {
        const numberWords: { [key: string]: string } = {
            'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
            'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
        }

        let converted = text.toLowerCase()

        // Handle "double" cases first (like "double seven" -> "77")
        converted = converted.replace(/double\s*(zero|one|two|three|four|five|six|seven|eight|nine)/gi, (_, match) => {
            return numberWords[match] + numberWords[match]
        })

        // Replace remaining number words with digits
        Object.entries(numberWords).forEach(([word, digit]) => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi')
            converted = converted.replace(regex, digit)
        })

        return converted
    }

    /**
     * Extract phone number from message
     */
    extractPhoneNumber(message: string): string | null {
        // First convert number words to digits for voice transcriptions
        const convertedMessage = this.convertNumberWordsToDigits(message)

        // Clean the message first - normalize spaces and remove common separators
        const cleanMessage = convertedMessage.replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()

        // Enhanced patterns for phone numbers in natural language (including spaced formats)
        const phonePatterns = [
            // Voice transcription pattern: 7 8 8 1 7 6 9 7, +9 6 1 7 1 5 3 4 7 1 0
            /\b(?:\+?\d\s?){6,15}\b/g,
            // Numbers with spaces: +961 71 534 710, 961 71 534 710, 71 534 710, 78 81 76 97
            /\b(?:\+?961\s?)?\d{1,2}(?:\s?\d{2,3}){1,3}(?:\s?\d{2,3})\b/g,
            // Standalone numbers: 71534710, +96171534710, 96171534710, 78817697
            /\b(\+?\d{6,15})\b/g,
            // Numbers with context: phone number 71534710, number: 71-534-710, mobile: +961 71 534 710
            /(?:phone|number|mobile|contact)\s*[:-]?\s*((?:\+?961\s?)?\d{1,2}(?:\s?\d{2,3}){1,3}(?:\s?\d{2,3})|\+?\d{6,15})/gi,
            // After common phrases: for 71534710, for +961 71 534 710, at 71 534 710
            /(?:for|at|to)\s+((?:\+?961\s?)?\d{1,2}(?:\s?\d{2,3}){1,3}(?:\s?\d{2,3})|\+?\d{6,15})\b/gi,
        ]

        // Try to find phone numbers in the message
        for (const pattern of phonePatterns) {
            const matches = cleanMessage.match(pattern)

            if (matches) {
                for (const match of matches) {
                    // Extract just the number part and clean it
                    let phoneNumber = match.replace(/[^\d+]/g, '')

                    // Skip if it's too short or too long (reduced minimum to 6)
                    if (phoneNumber.length < 6 || phoneNumber.length > 15) {
                        continue
                    }

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

        // Fallback: Try simple extraction for edge cases (reduced minimum to 6)
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
