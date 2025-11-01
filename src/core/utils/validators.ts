/**
 * Validation Utilities for Personality Setup
 * Ensures data integrity for bot configuration
 */

/**
 * Supported languages (ISO 639-1 codes)
 *
 * To add more languages:
 * 1. Add the language code as a key (ISO 639-1 standard)
 * 2. Provide the code, full name, and flag emoji
 * 3. Update your AI prompts to handle the new language
 *
 * Common language codes: ar (Arabic), en (English), fr (French),
 * es (Spanish), de (German), it (Italian), pt (Portuguese), ru (Russian)
 */
export const SUPPORTED_LANGUAGES = {
    ar: { code: 'ar', name: 'Arabic', flag: '🇦🇪' },
    en: { code: 'en', name: 'English', flag: '🇬🇧' },
    fr: { code: 'fr', name: 'French', flag: '🇫🇷' },
    es: { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    de: { code: 'de', name: 'German', flag: '🇩🇪' },
    it: { code: 'it', name: 'Italian', flag: '🇮🇹' },
    pt: { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
} as const

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES

/**
 * Supported timezones (IANA timezone database)
 *
 * To add more timezones:
 * 1. Use IANA timezone format (e.g., 'America/New_York', 'Europe/Paris')
 * 2. Provide the code, display name, and flag emoji
 * 3. Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
 *
 * Common timezones by region:
 * - Middle East: Asia/Beirut, Asia/Dubai, Asia/Riyadh, Asia/Jerusalem
 * - Europe: Europe/London, Europe/Paris, Europe/Berlin, Europe/Rome
 * - Americas: America/New_York, America/Los_Angeles, America/Chicago
 * - Asia: Asia/Tokyo, Asia/Shanghai, Asia/Singapore, Asia/Kolkata
 */
export const SUPPORTED_TIMEZONES = {
    // Middle East
    'Asia/Beirut': { code: 'Asia/Beirut', name: 'Lebanon (Beirut)', flag: '🇱🇧' },
    'Asia/Dubai': { code: 'Asia/Dubai', name: 'UAE (Dubai)', flag: '🇦🇪' },
    'Asia/Riyadh': { code: 'Asia/Riyadh', name: 'Saudi Arabia (Riyadh)', flag: '🇸🇦' },
    'Asia/Jerusalem': { code: 'Asia/Jerusalem', name: 'Israel (Jerusalem)', flag: '🇮🇱' },

    // Europe
    'Europe/London': { code: 'Europe/London', name: 'United Kingdom (London)', flag: '🇬🇧' },
    'Europe/Paris': { code: 'Europe/Paris', name: 'France (Paris)', flag: '🇫🇷' },
    'Europe/Berlin': { code: 'Europe/Berlin', name: 'Germany (Berlin)', flag: '🇩🇪' },
    'Europe/Rome': { code: 'Europe/Rome', name: 'Italy (Rome)', flag: '🇮🇹' },

    // Americas
    'America/New_York': { code: 'America/New_York', name: 'USA (New York)', flag: '🇺🇸' },
    'America/Chicago': { code: 'America/Chicago', name: 'USA (Chicago)', flag: '🇺🇸' },
    'America/Los_Angeles': { code: 'America/Los_Angeles', name: 'USA (Los Angeles)', flag: '🇺🇸' },

    // Asia-Pacific
    'Asia/Tokyo': { code: 'Asia/Tokyo', name: 'Japan (Tokyo)', flag: '🇯🇵' },
    'Asia/Singapore': { code: 'Asia/Singapore', name: 'Singapore', flag: '🇸🇬' },
    'Asia/Shanghai': { code: 'Asia/Shanghai', name: 'China (Shanghai)', flag: '🇨🇳' },
} as const

export type TimezoneCode = keyof typeof SUPPORTED_TIMEZONES

/**
 * Validate bot name
 * @param name - Bot name to validate
 * @returns Validation result with error message if invalid
 */
export function validateBotName(name: string): { valid: boolean; error?: string } {
    const trimmed = name.trim()

    if (!trimmed) {
        return { valid: false, error: 'Bot name cannot be empty' }
    }

    if (trimmed.length < 2) {
        return { valid: false, error: 'Bot name must be at least 2 characters long' }
    }

    if (trimmed.length > 50) {
        return { valid: false, error: 'Bot name cannot exceed 50 characters' }
    }

    return { valid: true }
}

/**
 * Validate language code
 * @param code - Language code to validate (ar, en, fr)
 * @returns Validation result with error message if invalid
 */
export function validateLanguage(code: string): { valid: boolean; error?: string } {
    if (!code) {
        return { valid: false, error: 'Language code cannot be empty' }
    }

    if (!(code in SUPPORTED_LANGUAGES)) {
        return {
            valid: false,
            error: `Invalid language code. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`,
        }
    }

    return { valid: true }
}

/**
 * Validate timezone
 * @param timezone - IANA timezone to validate
 * @returns Validation result with error message if invalid
 */
export function validateTimezone(timezone: string): { valid: boolean; error?: string } {
    if (!timezone) {
        return { valid: false, error: 'Timezone cannot be empty' }
    }

    if (!(timezone in SUPPORTED_TIMEZONES)) {
        return {
            valid: false,
            error: `Invalid timezone. Supported: ${Object.keys(SUPPORTED_TIMEZONES).join(', ')}`,
        }
    }

    // Additional check: Verify timezone is valid with Intl API
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone })
        return { valid: true }
    } catch (error) {
        return {
            valid: false,
            error: `Invalid IANA timezone: ${timezone}`,
        }
    }
}

/**
 * Get language name from code
 * @param code - Language code (ar, en, fr)
 * @returns Full language name with flag or code if not found
 */
export function getLanguageName(code: string): string {
    if (code in SUPPORTED_LANGUAGES) {
        const lang = SUPPORTED_LANGUAGES[code as LanguageCode]
        return `${lang.flag} ${lang.name}`
    }
    return code
}

/**
 * Get timezone display name
 * @param timezone - IANA timezone code
 * @returns Display name with flag or code if not found
 */
export function getTimezoneName(timezone: string): string {
    if (timezone in SUPPORTED_TIMEZONES) {
        const tz = SUPPORTED_TIMEZONES[timezone as TimezoneCode]
        return `${tz.flag} ${tz.name}`
    }
    return timezone
}
