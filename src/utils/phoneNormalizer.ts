/**
 * Phone number normalization utility
 * Ensures all phone numbers are in clean international E.164 format
 */

/**
 * Normalize a phone number to E.164 format
 *
 * Examples:
 * - "+96170118353" → "+96170118353"
 * - "+961 70 118 353" → "+96170118353"
 * - "961-70-118-353" → "+96170118353"
 * - "96170118353" → "+96170118353"
 *
 * @param input Raw phone number input
 * @returns Normalized phone number in E.164 format (+[country][number])
 * @throws Error if phone number is invalid
 */
export function normalizePhoneNumber(input: string): string {
    if (!input || typeof input !== 'string') {
        throw new Error('Phone number is required')
    }

    // Remove all whitespace, hyphens, parentheses, and dots
    let cleaned = input.replace(/[\s\-().]/g, '')

    // Check if it starts with + and extract it
    const hasPlus = cleaned.startsWith('+')
    if (hasPlus) {
        cleaned = cleaned.substring(1)
    }

    // Remove any remaining non-digit characters
    cleaned = cleaned.replace(/\D/g, '')

    // Validate length (E.164 format: 1-15 digits after country code)
    if (cleaned.length < 10 || cleaned.length > 15) {
        throw new Error(`Invalid phone number length: ${cleaned.length} digits. Must be 10-15 digits.`)
    }

    // Ensure it starts with a country code (doesn't start with 0)
    if (cleaned.startsWith('0')) {
        throw new Error('Phone number must include country code (e.g., +961 instead of 0)')
    }

    // Return normalized format with +
    return `+${cleaned}`
}

/**
 * Validate if a phone number is in E.164 format
 * @param phoneNumber Phone number to validate
 * @returns true if valid E.164 format
 */
export function isValidE164(phoneNumber: string): boolean {
    if (!phoneNumber) return false

    // E.164 regex: + followed by 10-15 digits
    const e164Regex = /^\+[1-9]\d{9,14}$/
    return e164Regex.test(phoneNumber)
}

/**
 * Format a phone number for display (adds spaces for readability)
 * Example: "+96170118353" → "+961 70 118 353"
 *
 * @param phoneNumber E.164 formatted phone number
 * @returns Formatted phone number with spaces
 */
export function formatForDisplay(phoneNumber: string): string {
    if (!isValidE164(phoneNumber)) {
        return phoneNumber // Return as-is if invalid
    }

    // Remove the + prefix
    const digits = phoneNumber.substring(1)

    // Format based on length (generic formatting)
    // Example: +96170118353 → +961 70 118 353
    if (digits.length >= 10) {
        // Country code (first 1-3 digits) + area code + number
        const countryCode = digits.substring(0, 3)
        const rest = digits.substring(3)

        // Split the rest into groups of 2-3 digits
        const groups: string[] = []
        for (let i = 0; i < rest.length; i += 3) {
            groups.push(rest.substring(i, i + 3))
        }

        return `+${countryCode} ${groups.join(' ')}`
    }

    return phoneNumber
}
