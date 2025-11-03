/**
 * User identifier extraction utility
 * Extracts and normalizes both phone numbers and usernames from messages
 */

import { validateIspUsername } from '~/core/utils/validators'

export interface ExtractedIdentifier {
    value: string
    type: 'phone' | 'username'
    original: string
    normalized?: string
}

/**
 * Extract user identifiers (phone numbers and usernames) from a message
 *
 * Examples:
 * - "Check user josianeyoussef" → [{ value: "josianeyoussef", type: "username", original: "josianeyoussef" }]
 * - "Call +961 71 534 710" → [{ value: "+96171534710", type: "phone", original: "+961 71 534 710", normalized: "71534710" }]
 * - "Info for john_doe and 71534710" → [{ value: "john_doe", type: "username", ... }, { value: "71534710", type: "phone", ... }]
 *
 * @param message The message to extract identifiers from
 * @returns Array of extracted identifiers with metadata
 */
export function extractUserIdentifiers(message: string): ExtractedIdentifier[] {
    if (!message || typeof message !== 'string') {
        return []
    }

    const identifiers: ExtractedIdentifier[] = []

    // Clean the message first - normalize spaces and remove common separators
    const cleanMessage = message.replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()

    // 1. Extract phone numbers first (more specific patterns)
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

    // Extract phone numbers
    const foundPhones = new Set<string>() // Track to avoid duplicates
    for (const pattern of phonePatterns) {
        const matches = cleanMessage.match(pattern)
        if (matches) {
            for (const match of matches) {
                // Extract just the number part and clean it
                const phoneNumber = match.replace(/[^\d+]/g, '')

                // Skip if it's too short or too long
                if (phoneNumber.length < 6 || phoneNumber.length > 15) continue
                if (foundPhones.has(phoneNumber)) continue

                foundPhones.add(phoneNumber)

                // Apply Lebanese phone number normalization
                let normalizedPhone = phoneNumber
                if (phoneNumber.startsWith('+961') && phoneNumber.length === 13) {
                    normalizedPhone = phoneNumber.substring(4) // Remove +961
                } else if (phoneNumber.startsWith('961') && phoneNumber.length === 12) {
                    normalizedPhone = phoneNumber.substring(3) // Remove 961
                } else if (phoneNumber.startsWith('+961')) {
                    normalizedPhone = phoneNumber.substring(4) // Remove +961
                } else if (phoneNumber.startsWith('961')) {
                    normalizedPhone = phoneNumber.substring(3) // Remove 961
                }

                identifiers.push({
                    value: phoneNumber,
                    type: 'phone',
                    original: match,
                    normalized: normalizedPhone
                })
            }
        }
    }

    // 2. Extract usernames (patterns that suggest usernames)
    const usernamePatterns = [
        // User references: @username, user josianeyoussef, username: john_doe
        /(?:user|username|account|customer)\s*[:-]?\s*([a-zA-Z0-9][a-zA-Z0-9_.]{2,31})/gi,
        // @ mentions: @username
        /@([a-zA-Z0-9][a-zA-Z0-9_.]{2,31})/g,
        // Common username patterns in context - very specific patterns only
        /(?:check|info|details|status|lookup|find|search|get|show)\s+([a-zA-Z0-9][a-zA-Z0-9_.]{4,31})\s+(?:for|me)$/gi,
        /(?:check|info|details|status|lookup|find|search|get|show)\s+(?:customer|user|account)\s+([a-zA-Z0-9][a-zA-Z0-9_.]{2,31})\b/gi,
        // More restrictive pattern for standalone usernames (avoid common words)
        // Only match if it contains underscore/dot or is longer than typical words
        /\b([a-zA-Z0-9][a-zA-Z0-9_.]{7,31})\b(?!@\w)/g, // 8+ chars
        /\b([a-zA-Z0-9][a-zA-Z0-9]*[_.][a-zA-Z0-9_.]*)\b(?!@\w)/g, // Contains underscore or dot
    ]

    // Extract usernames, avoiding phone numbers already found
    const foundUsernames = new Set<string>()
    for (const pattern of usernamePatterns) {
        const matches = cleanMessage.match(pattern)
        if (matches) {
            for (const match of matches) {
                // Extract the username part
                let username = match

                // Remove prefixes if present
                username = username.replace(/^(?:user|username|account|customer|@)\s*[:-]?\s*/i, '')
                username = username.replace(/^(?:check|info|details|status|lookup|find|search|get|show)\s+/i, '')
                username = username.replace(/^@/, '')
                username = username.trim()

                // Validate username format
                if (!validateIspUsername(username)) continue
                if (foundUsernames.has(username)) continue
                if (foundPhones.has(username)) continue // Skip if it was identified as a phone number

                // Skip common English words that might match username patterns
                const commonWords = new Set([
                    'what', 'when', 'where', 'why', 'how', 'this', 'that', 'with', 'have', 'will', 'from', 'they', 'know',
                    'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long',
                    'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'only', 'think', 'also', 'back',
                    'for', 'not', 'are', 'but', 'out', 'did', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
                    'old', 'our', 'see', 'she', 'too', 'way', 'who', 'her', 'let', 'put', 'say', 'she', 'too', 'use', 'was'
                ])
                if (commonWords.has(username.toLowerCase())) continue

                foundUsernames.add(username)

                identifiers.push({
                    value: username,
                    type: 'username',
                    original: match
                })
            }
        }
    }

    return identifiers
}

/**
 * Extract the first/best user identifier from a message
 * Prioritizes phone numbers over usernames if both are found
 *
 * @param message The message to extract from
 * @returns The first extracted identifier or null if none found
 */
export function extractFirstUserIdentifier(message: string): ExtractedIdentifier | null {
    const identifiers = extractUserIdentifiers(message)
    if (identifiers.length === 0) return null

    // Prioritize phone numbers
    const phone = identifiers.find(id => id.type === 'phone')
    if (phone) return phone

    // Return first username if no phone found
    return identifiers.find(id => id.type === 'username') || null
}


/**
 * Check if a string is a phone number
 *
 * @param input The string to check
 * @returns true if it looks like a phone number
 */
export function isPhoneNumber(input: string): boolean {
    if (!input || typeof input !== 'string') return false

    // Remove non-digit characters except +
    const cleanNumber = input.replace(/[^\d+]/g, '')

    // Basic phone number pattern: optional +, 6-15 digits
    return /^\+?\d{6,15}$/.test(cleanNumber)
}

/**
 * Check if a string is likely a username
 *
 * @param input The string to check
 * @returns true if it looks like a username
 */
export function isUsername(input: string): boolean {
    if (!input || typeof input !== 'string') return false

    // Clean input
    const clean = input.trim()

    // Quick checks
    if (clean.length < 3 || clean.length > 32) return false
    if (/^\d+$/.test(clean)) return false // Not all numbers

    // Username pattern
    return validateIspUsername(clean)
}

/**
 * Legacy function for backwards compatibility
 * Extract phone number from user message (now enhanced to handle usernames too)
 *
 * @deprecated Use extractUserIdentifiers or extractFirstUserIdentifier instead
 * @param message User message
 * @param senderId Sender ID (unused in new implementation)
 * @returns Extracted identifier (phone number or username) or empty string
 */
export function extractPhoneNumberFromMessage(message: string, senderId?: string): string {
    const identifier = extractFirstUserIdentifier(message)
    return identifier ? identifier.value : ''
}

// Re-export phone number functions for backwards compatibility
export { normalizePhoneNumber, isValidE164, formatForDisplay } from './phoneNormalizer'