/**
 * Session Analysis Utility
 *
 * Analyzes user session patterns to detect connection instability
 * and abnormal disconnection patterns
 */

import { parseUptimeToMinutes } from './uptimeParser'

export interface SessionPattern {
    totalSessions: number
    completedSessions: number
    activeSessions: number
    averageDurationMinutes: number | null
    shortSessions: number // < 5 minutes
    veryShortSessions: number // < 2 minutes
    longSessions: number // > 4 hours
    isUnstable: boolean
    instabilitySeverity: 'none' | 'moderate' | 'severe' | 'critical'
    recommendation: string | null
}

export interface SessionData {
    startSession: string
    endSession: string | null
    sessionTime: string | null
}

/**
 * Analyze session pattern for connection stability
 */
export function analyzeSessionPattern(
    sessions: SessionData[],
    timeWindowHours = 24
): SessionPattern {
    if (!sessions || sessions.length === 0) {
        return {
            totalSessions: 0,
            completedSessions: 0,
            activeSessions: 0,
            averageDurationMinutes: null,
            shortSessions: 0,
            veryShortSessions: 0,
            longSessions: 0,
            isUnstable: false,
            instabilitySeverity: 'none',
            recommendation: null,
        }
    }

    const now = new Date()
    const cutoffTime = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000)

    // Filter sessions within time window
    const recentSessions = sessions.filter((session) => {
        const sessionStart = new Date(session.startSession)
        return sessionStart >= cutoffTime
    })

    // Calculate session statistics
    const totalSessions = recentSessions.length
    const activeSessions = recentSessions.filter((s) => s.endSession === null).length
    const completedSessions = totalSessions - activeSessions

    let totalDurationMinutes = 0
    let shortSessions = 0
    let veryShortSessions = 0
    let longSessions = 0

    for (const session of recentSessions) {
        if (session.endSession === null) continue // Skip active sessions

        const durationMinutes = parseUptimeToMinutes(session.sessionTime)
        if (durationMinutes === null) continue

        totalDurationMinutes += durationMinutes

        if (durationMinutes < 2) {
            veryShortSessions++
            shortSessions++
        } else if (durationMinutes < 5) {
            shortSessions++
        } else if (durationMinutes > 240) {
            // > 4 hours
            longSessions++
        }
    }

    const averageDurationMinutes =
        completedSessions > 0 ? totalDurationMinutes / completedSessions : null

    // Determine instability severity
    const { isUnstable, instabilitySeverity, recommendation } = determineInstability(
        totalSessions,
        averageDurationMinutes,
        veryShortSessions,
        shortSessions,
        timeWindowHours
    )

    return {
        totalSessions,
        completedSessions,
        activeSessions,
        averageDurationMinutes,
        shortSessions,
        veryShortSessions,
        longSessions,
        isUnstable,
        instabilitySeverity,
        recommendation,
    }
}

/**
 * Determine connection instability severity
 *
 * Thresholds:
 * - Normal: 1-3 sessions/day, avg > 60 minutes
 * - Moderate: 4-9 sessions/day OR avg 10-60 minutes
 * - Severe: 10-19 sessions/day OR avg 5-10 minutes
 * - Critical: 20+ sessions/day OR avg < 5 minutes OR 10+ very short sessions
 */
function determineInstability(
    totalSessions: number,
    avgDurationMinutes: number | null,
    veryShortSessions: number,
    shortSessions: number,
    timeWindowHours: number
): {
    isUnstable: boolean
    instabilitySeverity: 'none' | 'moderate' | 'severe' | 'critical'
    recommendation: string | null
} {
    // Normalize to 24-hour window for comparison
    const sessionsPerDay = (totalSessions / timeWindowHours) * 24
    const avgDuration = avgDurationMinutes ?? 0

    // Critical instability
    if (sessionsPerDay >= 20 || avgDuration < 5 || veryShortSessions >= 10) {
        return {
            isUnstable: true,
            instabilitySeverity: 'critical',
            recommendation: `CRITICAL: ${Math.round(sessionsPerDay)} sessions/day with ${Math.round(avgDuration)}min avg duration. Check signal strength (-71 dBm or worse), AP link downs, power supply, and customer equipment immediately.`,
        }
    }

    // Severe instability
    if (sessionsPerDay >= 10 || (avgDuration >= 5 && avgDuration < 10) || veryShortSessions >= 5) {
        return {
            isUnstable: true,
            instabilitySeverity: 'severe',
            recommendation: `SEVERE: ${Math.round(sessionsPerDay)} sessions/day with ${Math.round(avgDuration)}min avg duration. Frequent reconnections detected. Investigate signal quality, AP stability, and potential hardware issues.`,
        }
    }

    // Moderate instability
    if (
        sessionsPerDay >= 4 ||
        (avgDuration >= 10 && avgDuration < 60) ||
        shortSessions >= 5
    ) {
        return {
            isUnstable: true,
            instabilitySeverity: 'moderate',
            recommendation: `MODERATE: ${Math.round(sessionsPerDay)} sessions/day with ${Math.round(avgDuration)}min avg duration. Monitor signal strength and AP performance. May need equipment inspection.`,
        }
    }

    // Stable connection
    return {
        isUnstable: false,
        instabilitySeverity: 'none',
        recommendation: null,
    }
}

/**
 * Calculate time span of sessions (hours)
 */
export function calculateSessionTimeSpan(sessions: SessionData[]): number | null {
    if (!sessions || sessions.length === 0) return null

    const sortedSessions = [...sessions].sort(
        (a, b) => new Date(a.startSession).getTime() - new Date(b.startSession).getTime()
    )

    const firstSession = new Date(sortedSessions[0].startSession)
    const lastSession = new Date(sortedSessions[sortedSessions.length - 1].startSession)

    const diffMs = lastSession.getTime() - firstSession.getTime()
    return diffMs / (1000 * 60 * 60) // Convert to hours
}

/**
 * Get current active session duration (minutes)
 */
export function getCurrentSessionDuration(sessions: SessionData[]): number | null {
    if (!sessions || sessions.length === 0) return null

    // Find most recent active session
    const activeSession = sessions
        .filter((s) => s.endSession === null)
        .sort((a, b) => new Date(b.startSession).getTime() - new Date(a.startSession).getTime())[0]

    if (!activeSession) return null

    const startTime = new Date(activeSession.startSession)
    const now = new Date()
    const diffMs = now.getTime() - startTime.getTime()

    return Math.floor(diffMs / (1000 * 60)) // Convert to minutes
}
