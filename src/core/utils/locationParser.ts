/**
 * Location Parser Utility
 *
 * Extracts coordinates from various location URL formats and text messages.
 * Supports Google Maps URLs and other common location link formats.
 */

import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('location-parser')

export interface LocationCoordinates {
    latitude: number
    longitude: number
}

/**
 * Check if URL is a Google Maps short link (goo.gl)
 */
function isGoogleMapsShortUrl(url: string): boolean {
    return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)
}

/**
 * Resolve Google Maps short URL to full URL with coordinates
 * @param shortUrl - Short URL (e.g., https://maps.app.goo.gl/...)
 * @param timeoutMs - Request timeout (default: 5000ms)
 * @returns Final URL with coordinates or null if resolution fails
 */
async function resolveGoogleMapsShortUrl(shortUrl: string, timeoutMs = 5000): Promise<string | null> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        const response = await fetch(shortUrl, {
            redirect: 'follow', // Auto-follow redirects
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
            },
        })

        clearTimeout(timeoutId)

        logger.debug({ shortUrl, finalUrl: response.url }, 'Short URL resolved')
        return response.url
    } catch (error) {
        logger.error({ err: error, url: shortUrl }, 'Failed to resolve short URL')
        return null
    }
}

/**
 * Extract coordinates from text containing location URLs
 *
 * Supported formats:
 * - https://maps.google.com/?q=33.954967,35.616299
 * - https://www.google.com/maps?q=33.954967,35.616299
 * - https://maps.app.goo.gl/... (Google short links - automatically resolved)
 * - Location: https://maps.google.com/?q=33.954967,35.616299
 * - Plain text with embedded URLs
 *
 * @param text - Text that may contain a location URL
 * @returns Coordinates object or null if no valid location found
 */
export async function extractCoordinatesFromText(text: string): Promise<LocationCoordinates | null> {
    if (!text || typeof text !== 'string') {
        return null
    }

    const urlToCheck = text

    // // Check if URL is a short link and resolve it
    // if (isGoogleMapsShortUrl(text)) {
    //     logger.debug({ url: text }, 'Detected Google Maps short URL, resolving...')
    //     const resolvedUrl = await resolveGoogleMapsShortUrl(text)
    //     if (resolvedUrl) {
    //         urlToCheck = resolvedUrl
    //         logger.info({ shortUrl: text, resolvedUrl }, 'Short URL resolved successfully')
    //     } else {
    //         logger.warn({ url: text }, 'Failed to resolve short URL')
    //         return null // Cannot extract coordinates from unresolved short link
    //     }
    // }

    // Google Maps URL patterns
    const urlPatterns = [
        // Standard Google Maps: ?q=lat,lon
        /(?:maps\.google\.com|google\.com\/maps|maps\.app\.goo\.gl).*[?&]q=([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/i,

        // Google Maps: ?ll=lat,lon
        /(?:maps\.google\.com|google\.com\/maps).*[?&]ll=([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/i,

        // Google Maps: @lat,lon format
        /(?:maps\.google\.com|google\.com\/maps).*@([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/i,

        // OpenStreetMap: ?mlat=lat&mlon=lon
        /openstreetmap\.org.*[?&]mlat=([-+]?\d+\.?\d*).*[?&]mlon=([-+]?\d+\.?\d*)/i,

        // Google Maps: /place/lat,lon format
        /(?:maps\.google\.com|google\.com\/maps)\/place\/([-+]?\d{1,3}\.\d+),([-+]?\d{1,3}\.\d+)/i,

        // Generic coordinate pattern in URLs (last resort)
        /(?:https?:\/\/[^\s]+?)[/?]([-+]?\d{1,3}\.\d{4,}),([-+]?\d{1,3}\.\d{4,})/i,
    ]

    for (const pattern of urlPatterns) {
        const match = urlToCheck.match(pattern)
        if (match) {
            const lat = parseFloat(match[1])
            const lon = parseFloat(match[2])

            logger.debug({ lat, lon, pattern: pattern.source }, 'Coordinates extracted from URL')

            // Validate coordinate ranges
            if (!isNaN(lat) && !isNaN(lon) && isValidLatitude(lat) && isValidLongitude(lon)) {
                return { latitude: lat, longitude: lon }
            } else {
                logger.warn({ lat, lon }, 'Extracted coordinates out of valid range')
            }
        }
    }

    return null
}

/**
 * Check if text contains a location URL
 */
export function containsLocationUrl(text: string): boolean {
    if (!text || typeof text !== 'string') {
        return false
    }

    // Check for common location URL domains
    const locationDomains = [
        'maps.google.com',
        'google.com/maps',
        'maps.app.goo.gl',
        'goo.gl/maps',
        'openstreetmap.org',
    ]

    return locationDomains.some((domain) => text.toLowerCase().includes(domain))
}

/**
 * Validate latitude is within valid range (-90 to 90)
 */
function isValidLatitude(lat: number): boolean {
    return lat >= -90 && lat <= 90
}

/**
 * Validate longitude is within valid range (-180 to 180)
 */
function isValidLongitude(lon: number): boolean {
    return lon >= -180 && lon <= 180
}

/**
 * Parse coordinates from plain "lat, lon" format (backward compatibility)
 */
export function parseCoordinatePair(text: string): LocationCoordinates | null {
    if (!text || typeof text !== 'string') {
        return null
    }

    // Match "lat, lon" format
    const coordRegex = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/
    const match = text.trim().match(coordRegex)

    if (match) {
        const lat = parseFloat(match[1])
        const lon = parseFloat(match[2])

        if (!isNaN(lat) && !isNaN(lon) && isValidLatitude(lat) && isValidLongitude(lon)) {
            return { latitude: lat, longitude: lon }
        }
    }

    return null
}
