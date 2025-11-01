/**
 * Date Helpers - Timezone-aware date calculations
 *
 * These utilities ensure consistent date handling across the application,
 * using the user's configured timezone from their personality settings.
 */

import { createFlowLogger } from './logger'

const dateLogger = createFlowLogger('date-helpers')

/**
 * Get today's date in user's timezone
 *
 * @param timezone - IANA timezone string (e.g., 'America/New_York', 'UTC', 'Asia/Tokyo')
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayInTimezone(timezone: string): string {
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })

    const parts = formatter.formatToParts(now)
    const year = parts.find(p => p.type === 'year')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const day = parts.find(p => p.type === 'day')?.value || ''

    return `${year}-${month}-${day}`
}

/**
 * Get yesterday's date in user's timezone
 *
 * @param timezone - IANA timezone string
 * @returns Date string in YYYY-MM-DD format
 */
export function getYesterdayInTimezone(timezone: string): string {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    })

    const parts = formatter.formatToParts(yesterday)
    const year = parts.find(p => p.type === 'year')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const day = parts.find(p => p.type === 'day')?.value || ''

    return `${year}-${month}-${day}`
}

/**
 * Validate that a date string is in YYYY-MM-DD format and is reasonable
 *
 * @param dateString - Date string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDateString(dateString: string): boolean {
    // Check format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateString)) {
        return false
    }

    // Check if it's a valid date
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
        return false
    }

    // Check if it's within reasonable range (not before 2000, not more than 1 year in future)
    const year = parseInt(dateString.substring(0, 4))
    const currentYear = new Date().getFullYear()

    if (year < 2000 || year > currentYear + 1) {
        return false
    }

    return true
}

/**
 * Check if a date is "today" in the given timezone
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @param timezone - IANA timezone string
 * @returns true if date matches today in the timezone
 */
export function isToday(dateString: string, timezone: string): boolean {
    const today = getTodayInTimezone(timezone)
    return dateString === today
}

/**
 * Check if a date is "yesterday" in the given timezone
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @param timezone - IANA timezone string
 * @returns true if date matches yesterday in the timezone
 */
export function isYesterday(dateString: string, timezone: string): boolean {
    const yesterday = getYesterdayInTimezone(timezone)
    return dateString === yesterday
}

/**
 * Get date from intent enum (research-based approach)
 *
 * RESEARCH FINDING: LLMs are bad at date calculation. Best practice is to have AI
 * indicate INTENT (today/yesterday) and let server calculate the actual date.
 *
 * This approach eliminates AI date calculation errors entirely.
 *
 * @param dateIntent - Date intent from AI ("today" | "yesterday" | null)
 * @param timezone - User's IANA timezone string
 * @returns Calculated date string in YYYY-MM-DD format
 */
export function getDateFromIntent(dateIntent: "today" | "yesterday" | null, timezone: string): string {
    dateLogger.debug({ dateIntent, timezone }, 'Calculating date from intent')

    switch (dateIntent) {
        case "today":
            return getTodayInTimezone(timezone)
        case "yesterday":
            return getYesterdayInTimezone(timezone)
        case null:
        default:
            // Default to today when no intent specified
            return getTodayInTimezone(timezone)
    }
}
