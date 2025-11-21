/**
 * Signal Analysis Utility
 *
 * Parses and analyzes WiFi signal strength (dBm values)
 * Based on 2025 industry standards for signal quality thresholds
 */

export type SignalQuality = 'excellent' | 'good' | 'fair' | 'weak' | 'poor' | 'very-poor' | 'unknown'

export interface SignalAnalysis {
    dBm: number | null
    quality: SignalQuality
    description: string
    isHealthy: boolean
    needsAttention: boolean
    recommendation: string | null
}

/**
 * Parse signal strength from API format
 * Examples: "-71 / -58", "-71 dBm", "-71"
 */
export function parseSignalStrength(signalStr: string | null | undefined): number | null {
    if (!signalStr) return null

    try {
        // Extract first number (main signal value)
        // Handles formats: "-71 / -58", "-71 dBm", "-71"
        const match = signalStr.match(/-?\d+/)
        if (!match) return null

        const value = parseInt(match[0], 10)

        // Sanity check: dBm values should be between -100 and 0
        if (value > 0 || value < -100) return null

        return value
    } catch {
        return null
    }
}

/**
 * Classify signal quality based on dBm value
 *
 * WiFi Signal Strength Standards (2025):
 * - Excellent: -30 to -50 dBm (ideal for all activities)
 * - Good: -51 to -65 dBm (stable, suitable for streaming/VoIP)
 * - Fair: -66 to -75 dBm (acceptable for browsing, may degrade under load)
 * - Weak: -76 to -85 dBm (slow speeds, increased latency)
 * - Poor: -86 to -90 dBm (frequent disconnects, unusable)
 * - Very Poor: Below -90 dBm (connection failure imminent)
 */
export function classifySignalQuality(dBm: number | null): SignalQuality {
    if (dBm === null) return 'unknown'

    if (dBm >= -50) return 'excellent'
    if (dBm >= -65) return 'good'
    if (dBm >= -75) return 'fair'
    if (dBm >= -85) return 'weak'
    if (dBm >= -90) return 'poor'
    return 'very-poor'
}

/**
 * Get human-readable description for signal quality
 */
export function getSignalDescription(quality: SignalQuality): string {
    switch (quality) {
        case 'excellent':
            return 'Excellent signal strength - ideal for all activities'
        case 'good':
            return 'Good signal strength - stable for streaming and VoIP'
        case 'fair':
            return 'Fair signal strength - acceptable for browsing'
        case 'weak':
            return 'Weak signal strength - may cause slow speeds'
        case 'poor':
            return 'Poor signal strength - frequent disconnects likely'
        case 'very-poor':
            return 'Very poor signal strength - connection failure imminent'
        case 'unknown':
            return 'Signal strength unknown'
    }
}

/**
 * Get recommendation for improving signal
 */
export function getSignalRecommendation(quality: SignalQuality, dBm: number | null): string | null {
    switch (quality) {
        case 'very-poor':
        case 'poor':
            return `URGENT: Signal booster or repeater required. Current signal (${dBm} dBm) is too weak for stable connection.`
        case 'weak':
            return `Signal booster recommended. Current signal (${dBm} dBm) may cause disconnections and slow speeds.`
        case 'fair':
            return `Consider signal optimization if customer reports performance issues. Current signal (${dBm} dBm) is acceptable but not optimal.`
        default:
            return null
    }
}

/**
 * Analyze signal strength from API response
 */
export function analyzeSignal(signalStr: string | null | undefined): SignalAnalysis {
    const dBm = parseSignalStrength(signalStr)
    const quality = classifySignalQuality(dBm)
    const description = getSignalDescription(quality)
    const isHealthy = quality === 'excellent' || quality === 'good'
    const needsAttention = quality === 'weak' || quality === 'poor' || quality === 'very-poor'
    const recommendation = getSignalRecommendation(quality, dBm)

    return {
        dBm,
        quality,
        description,
        isHealthy,
        needsAttention,
        recommendation,
    }
}
