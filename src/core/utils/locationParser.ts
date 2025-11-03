/**
 * Location Parser Utility
 *
 * Extracts coordinates from various location URL formats and text messages.
 * Supports Google Maps URLs (including Place IDs) and other common location link formats.
 *
 * Uses Google Maps API for accurate coordinate resolution when:
 * - URL contains a Place ID (e.g., ChIJXYZ...)
 * - Traditional regex extraction fails
 */

import { createFlowLogger } from '~/core/utils/logger'
import { googleMapsService } from '~/services/googleMapsService'

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
 * Convert DMS (Degrees, Minutes, Seconds) to Decimal Degrees
 * @param degrees - Degrees
 * @param minutes - Minutes
 * @param seconds - Seconds
 * @param direction - Direction (N/S for latitude, E/W for longitude)
 * @returns Decimal degrees
 */
function dmsToDecimal(degrees: number, minutes: number, seconds: number, direction: string): number {
    let decimal = degrees + minutes / 60 + seconds / 3600

    // South and West are negative
    if (direction === 'S' || direction === 'W') {
        decimal = -decimal
    }

    return decimal
}

/**
 * Extract coordinates from DMS (Degrees, Minutes, Seconds) format in URL
 * Example: 33°47'57.0"N 35°32'30.4"E
 * URL-encoded: 33%C2%B047'57.0%22N+35%C2%B032'30.4%22E
 */
function extractDMSCoordinates(url: string): LocationCoordinates | null {
    try {
        // Decode URL first
        const decoded = decodeURIComponent(url)

        // Match DMS pattern: degrees°minutes'seconds"Direction
        // Example: 33°47'57.0"N 35°32'30.4"E
        const dmsPattern = /([-+]?\d+)[°\s]+([\d.]+)['\s]+([\d.]+)["'\s]*([NSEW])[,\s+]+([-+]?\d+)[°\s]+([\d.]+)['\s]+([\d.]+)["'\s]*([NSEW])/i

        const match = decoded.match(dmsPattern)
        if (!match) {
            return null
        }

        const latDegrees = parseFloat(match[1])
        const latMinutes = parseFloat(match[2])
        const latSeconds = parseFloat(match[3])
        const latDirection = match[4].toUpperCase()

        const lonDegrees = parseFloat(match[5])
        const lonMinutes = parseFloat(match[6])
        const lonSeconds = parseFloat(match[7])
        const lonDirection = match[8].toUpperCase()

        const latitude = dmsToDecimal(latDegrees, latMinutes, latSeconds, latDirection)
        const longitude = dmsToDecimal(lonDegrees, lonMinutes, lonSeconds, lonDirection)

        if (isValidLatitude(latitude) && isValidLongitude(longitude)) {
            return { latitude, longitude }
        }

        return null
    } catch (error) {
        return null
    }
}

/**
 * Extract Google Maps Place ID from URL
 * Place IDs start with ChIJ and contain alphanumeric characters, underscores, and hyphens
 *
 * Supported formats:
 * - /place/ChIJXYZ.../
 * - /place/Name/ChIJXYZ.../
 * - ?place_id=ChIJXYZ...
 * - /data=...!1s0x0:0xChIJXYZ... (encoded format)
 *
 * @param url - Google Maps URL
 * @returns Place ID or null if not found
 */
function extractPlaceId(url: string): string | null {
    // Pattern 1: Direct /place/ChIJ... format
    const directPlaceIdMatch = url.match(/\/place\/([A-Za-z0-9_-]{27})\/?/)
    if (directPlaceIdMatch) {
        return directPlaceIdMatch[1]
    }

    // Pattern 2: Place name followed by Place ID: /place/Name/ChIJ...
    const namedPlaceIdMatch = url.match(/\/place\/[^/]+\/([A-Za-z0-9_-]{27})\/?/)
    if (namedPlaceIdMatch) {
        return namedPlaceIdMatch[1]
    }

    // Pattern 3: Query parameter: ?place_id=ChIJ...
    const queryParamMatch = url.match(/[?&]place_id=([A-Za-z0-9_-]{27})/)
    if (queryParamMatch) {
        return queryParamMatch[1]
    }

    // Pattern 4: Encoded in data parameter (less common)
    const encodedMatch = url.match(/!1s(ChIJ[A-Za-z0-9_-]{23})/)
    if (encodedMatch) {
        return encodedMatch[1]
    }

    return null
}

/**
 * Resolve Google Maps short URL to coordinates
 *
 * Strategy:
 * 1. Follow HTTP redirect to get full URL
 * 2. Extract coordinates from URL query parameters (!3d and !4d parameters are most accurate)
 * 3. If no coordinates found, extract Place ID and use Google Maps API
 *
 * @param shortUrl - Short URL (e.g., https://maps.app.goo.gl/...)
 * @returns Coordinates or null if resolution fails
 */
async function resolveGoogleMapsShortUrl(shortUrl: string): Promise<LocationCoordinates | null> {
    try {
        logger.debug({ shortUrl }, 'Resolving Google Maps short URL via HTTP redirect')

        // Step 1: Follow HTTP redirect to get full URL
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const response = await fetch(shortUrl, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
            },
        })

        clearTimeout(timeoutId)
        const resolvedUrl = response.url

        logger.info({ shortUrl, resolvedUrl }, 'Short URL resolved via HTTP redirect')

        // Step 2: Try to extract coordinates from resolved URL
        // Priority 1: Extract DMS coordinates from place name (MOST ACCURATE)
        const dmsCoords = extractDMSCoordinates(resolvedUrl)
        if (dmsCoords) {
            logger.info(
                { shortUrl, ...dmsCoords, method: 'dms-conversion' },
                'Extracted accurate coordinates from DMS format'
            )
            return dmsCoords
        }

        // Priority 2: Extract from !3d (latitude) and !4d (longitude) parameters
        const dataParamsMatch = resolvedUrl.match(/!3d([-+]?\d+\.?\d*)!4d([-+]?\d+\.?\d*)/)
        if (dataParamsMatch) {
            const lat = parseFloat(dataParamsMatch[1])
            const lon = parseFloat(dataParamsMatch[2])

            if (!isNaN(lat) && !isNaN(lon) && isValidLatitude(lat) && isValidLongitude(lon)) {
                logger.info({ shortUrl, lat, lon, method: 'data-params' }, 'Extracted coordinates from !3d/!4d parameters')
                return { latitude: lat, longitude: lon }
            }
        }

        // Priority 2: Try other URL patterns
        const urlPatterns = [
            // @lat,lon format
            /@([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/,
            // ?q=lat,lon
            /[?&]q=([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/,
            // ?ll=lat,lon
            /[?&]ll=([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/,
        ]

        for (const pattern of urlPatterns) {
            const match = resolvedUrl.match(pattern)
            if (match) {
                const lat = parseFloat(match[1])
                const lon = parseFloat(match[2])

                if (!isNaN(lat) && !isNaN(lon) && isValidLatitude(lat) && isValidLongitude(lon)) {
                    logger.info({ shortUrl, lat, lon, method: 'url-params' }, 'Extracted coordinates from URL parameters')
                    return { latitude: lat, longitude: lon }
                }
            }
        }

        // Step 3: If no coordinates found, try to extract Place ID and use API
        if (googleMapsService.isEnabled()) {
            const placeId = extractPlaceId(resolvedUrl)
            if (placeId) {
                logger.info({ shortUrl, placeId }, 'No coordinates in URL, attempting Place ID resolution via API')

                const coordinates = await googleMapsService.resolvePlaceIdToCoordinates(placeId)
                if (coordinates) {
                    logger.info({ shortUrl, placeId, coordinates, method: 'place-api' }, 'Successfully resolved Place ID to coordinates')
                    return coordinates
                } else {
                    logger.warn({ shortUrl, placeId }, 'Failed to resolve Place ID via API')
                }
            }
        }

        logger.warn({ shortUrl, resolvedUrl }, 'Could not extract coordinates from resolved URL')
        return null
    } catch (error) {
        logger.error({ err: error, shortUrl }, 'Failed to resolve short URL')
        return null
    }
}

/**
 * Extract coordinates from text containing location URLs
 *
 * Supported formats:
 * - https://maps.google.com/?q=33.954967,35.616299
 * - https://www.google.com/maps?q=33.954967,35.616299
 * - https://maps.app.goo.gl/... (Google short links - resolved via Google Maps API)
 * - https://maps.google.com/place/ChIJXYZ... (Place IDs - resolved via Google Maps API)
 * - Location: https://maps.google.com/?q=33.954967,35.616299
 * - Plain text with embedded URLs
 *
 * Resolution Strategy:
 * 1. Check if URL is a short link → Resolve via Google Maps API (accurate coordinates)
 * 2. Try regex extraction from URL (fast, backward compatible)
 * 3. Extract Place ID and resolve via Google Maps API (fallback for complex URLs)
 *
 * @param text - Text that may contain a location URL
 * @returns Coordinates object or null if no valid location found
 */
export async function extractCoordinatesFromText(text: string): Promise<LocationCoordinates | null> {
    if (!text || typeof text !== 'string') {
        return null
    }

    // Step 1: Check if URL is a short link and resolve via Google Maps API
    if (isGoogleMapsShortUrl(text)) {
        logger.debug({ url: text }, 'Detected Google Maps short URL, resolving via API...')
        const coordinates = await resolveGoogleMapsShortUrl(text)
        if (coordinates) {
            logger.info({ shortUrl: text, coordinates, method: 'google-maps-api' }, 'Short URL resolved successfully via API')
            return coordinates
        } else {
            logger.warn({ url: text }, 'Failed to resolve short URL via API')
            return null
        }
    }

    // Step 2: Try regex extraction (fast, works for URLs with embedded coordinates)
    const urlPatterns = [
        // Standard Google Maps: ?q=lat,lon
        /(?:maps\.google\.com|google\.com\/maps).*[?&]q=([-+]?\d+\.?\d*),([-+]?\d+\.?\d*)/i,

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
        const match = text.match(pattern)
        if (match) {
            const lat = parseFloat(match[1])
            const lon = parseFloat(match[2])

            logger.debug({ lat, lon, pattern: pattern.source }, 'Coordinates extracted via regex')

            // Validate coordinate ranges
            if (!isNaN(lat) && !isNaN(lon) && isValidLatitude(lat) && isValidLongitude(lon)) {
                logger.info({ lat, lon, method: 'regex' }, 'Successfully extracted coordinates via regex')
                return { latitude: lat, longitude: lon }
            } else {
                logger.warn({ lat, lon }, 'Extracted coordinates out of valid range')
            }
        }
    }

    // Step 3: Fallback to Google Maps API (Place ID resolution)
    if (googleMapsService.isEnabled()) {
        logger.debug({ url: text }, 'Regex extraction failed, attempting Place ID extraction')

        const placeId = extractPlaceId(text)
        if (placeId) {
            logger.info({ placeId }, 'Place ID detected, resolving via Google Maps API')

            const coordinates = await googleMapsService.resolvePlaceIdToCoordinates(placeId)
            if (coordinates) {
                logger.info({ placeId, coordinates, method: 'google-maps-api' }, 'Successfully resolved Place ID to coordinates')
                return coordinates
            } else {
                logger.warn({ placeId }, 'Failed to resolve Place ID via Google Maps API')
            }
        } else {
            logger.debug({ url: text }, 'No Place ID found in URL')
        }
    } else {
        logger.debug('Google Maps API is disabled, skipping Place ID resolution')
    }

    logger.warn({ url: text }, 'Failed to extract coordinates from URL')
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
