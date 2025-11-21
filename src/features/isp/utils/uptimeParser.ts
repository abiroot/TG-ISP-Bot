/**
 * Uptime Parser Utility
 *
 * Parses uptime strings from ISP API into minutes
 * Handles formats: "1w23h7m5s", "34m41s", "16m20s", "0 D : 8 H : 37 M : 22 S"
 */

/**
 * Parse uptime string to total minutes
 *
 * Supported formats:
 * - Compact: "1w23h7m5s", "34m41s", "16m20s"
 * - Verbose: "0 D : 8 H : 37 M : 22 S"
 *
 * Returns null if parsing fails
 */
export function parseUptimeToMinutes(uptime: string | null | undefined): number | null {
    if (!uptime) return null

    try {
        // Handle verbose format: "0 D : 8 H : 37 M : 22 S"
        if (uptime.includes(':')) {
            return parseVerboseUptime(uptime)
        }

        // Handle compact format: "1w23h7m5s"
        return parseCompactUptime(uptime)
    } catch {
        return null
    }
}

/**
 * Parse verbose format: "0 D : 8 H : 37 M : 22 S"
 */
function parseVerboseUptime(uptime: string): number | null {
    try {
        const parts = uptime.split(':').map((p) => p.trim())
        if (parts.length !== 4) return null

        const days = parseInt(parts[0], 10)
        const hours = parseInt(parts[1], 10)
        const minutes = parseInt(parts[2], 10)
        // Seconds are ignored for minute calculation

        if (isNaN(days) || isNaN(hours) || isNaN(minutes)) return null

        return days * 24 * 60 + hours * 60 + minutes
    } catch {
        return null
    }
}

/**
 * Parse compact format: "1w23h7m5s"
 */
function parseCompactUptime(uptime: string): number | null {
    try {
        let totalMinutes = 0

        // Parse weeks (w)
        const weeksMatch = uptime.match(/(\d+)w/)
        if (weeksMatch) {
            totalMinutes += parseInt(weeksMatch[1], 10) * 7 * 24 * 60
        }

        // Parse days (d)
        const daysMatch = uptime.match(/(\d+)d/)
        if (daysMatch) {
            totalMinutes += parseInt(daysMatch[1], 10) * 24 * 60
        }

        // Parse hours (h)
        const hoursMatch = uptime.match(/(\d+)h/)
        if (hoursMatch) {
            totalMinutes += parseInt(hoursMatch[1], 10) * 60
        }

        // Parse minutes (m)
        const minutesMatch = uptime.match(/(\d+)m/)
        if (minutesMatch) {
            totalMinutes += parseInt(minutesMatch[1], 10)
        }

        // Seconds are ignored for minute calculation

        return totalMinutes
    } catch {
        return null
    }
}

/**
 * Parse uptime string to human-readable format
 * Returns: { weeks, days, hours, minutes }
 */
export interface UptimeComponents {
    weeks: number
    days: number
    hours: number
    minutes: number
}

export function parseUptimeComponents(uptime: string | null | undefined): UptimeComponents | null {
    const totalMinutes = parseUptimeToMinutes(uptime)
    if (totalMinutes === null) return null

    const weeks = Math.floor(totalMinutes / (7 * 24 * 60))
    const remainingAfterWeeks = totalMinutes % (7 * 24 * 60)

    const days = Math.floor(remainingAfterWeeks / (24 * 60))
    const remainingAfterDays = remainingAfterWeeks % (24 * 60)

    const hours = Math.floor(remainingAfterDays / 60)
    const minutes = remainingAfterDays % 60

    return { weeks, days, hours, minutes }
}

/**
 * Calculate uptime percentage based on total minutes
 * Assumes 30-day month for percentage calculation
 */
export function calculateUptimePercentage(totalMinutes: number | null, periodDays = 30): number | null {
    if (totalMinutes === null) return null

    const totalMinutesInPeriod = periodDays * 24 * 60
    const percentage = (totalMinutes / totalMinutesInPeriod) * 100

    // Cap at 100%
    return Math.min(percentage, 100)
}

/**
 * Check if uptime indicates recent restart (< threshold minutes)
 */
export function isRecentRestart(uptime: string | null | undefined, thresholdMinutes = 60): boolean {
    const totalMinutes = parseUptimeToMinutes(uptime)
    if (totalMinutes === null) return false

    return totalMinutes < thresholdMinutes
}
