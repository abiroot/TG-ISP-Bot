import { Client, PlaceDetailsResponseData, GeocodeResponseData } from '@googlemaps/google-maps-services-js'
import { env } from '~/config/env'
import { loggers } from '~/core/utils/logger'

const logger = loggers.googleMaps

/**
 * Coordinates interface
 */
export interface Coordinates {
    latitude: number
    longitude: number
}

/**
 * Google Maps Service
 * Provides accurate coordinate resolution using official Google Maps APIs
 */
class GoogleMapsService {
    private client: Client
    private enabled: boolean

    constructor() {
        this.enabled = env.GOOGLE_MAPS_ENABLED
        this.client = new Client({})
        logger.info({ enabled: this.enabled }, 'Google Maps service initialized')
    }

    /**
     * Check if Google Maps service is enabled
     */
    isEnabled(): boolean {
        return this.enabled
    }

    /**
     * Resolve a Google Maps Place ID to coordinates
     * @param placeId - Google Maps Place ID (e.g., "ChIJXYZ...")
     * @returns Coordinates or null if resolution fails
     */
    async resolvePlaceIdToCoordinates(placeId: string): Promise<Coordinates | null> {
        if (!this.enabled) {
            logger.warn('Google Maps service is disabled')
            return null
        }

        try {
            logger.debug({ placeId }, 'Resolving Place ID to coordinates')

            const response = await this.client.placeDetails({
                params: {
                    place_id: placeId,
                    fields: ['geometry'],
                    key: env.GOOGLE_API_KEY,
                },
                timeout: 5000,
            })

            if (response.data.status !== 'OK') {
                logger.warn(
                    { placeId, status: response.data.status, errorMessage: response.data.error_message },
                    'Place Details API returned non-OK status'
                )
                return null
            }

            const location = response.data.result?.geometry?.location
            if (!location) {
                logger.warn({ placeId }, 'Place Details API returned no location')
                return null
            }

            const coordinates: Coordinates = {
                latitude: location.lat,
                longitude: location.lng,
            }

            logger.info({ placeId, coordinates }, 'Successfully resolved Place ID to coordinates')
            return coordinates
        } catch (error) {
            logger.error({ err: error, placeId }, 'Failed to resolve Place ID to coordinates')
            return null
        }
    }

    /**
     * Resolve any Google Maps URL (including short URLs) to coordinates using Google Maps API
     *
     * This method uses the Geocoding API which can handle:
     * - Short URLs (maps.app.goo.gl/...)
     * - Place URLs with Place IDs
     * - Regular Google Maps URLs
     *
     * The API automatically resolves the URL and returns accurate coordinates.
     *
     * @param url - Google Maps URL (can be short URL or full URL)
     * @returns Coordinates or null if resolution fails
     */
    async resolveUrlToCoordinates(url: string): Promise<Coordinates | null> {
        if (!this.enabled) {
            logger.warn('Google Maps service is disabled')
            return null
        }

        try {
            logger.debug({ url }, 'Resolving Google Maps URL to coordinates via API')

            // Use Geocoding API which can handle Google Maps URLs directly
            const response = await this.client.geocode({
                params: {
                    address: url,
                    key: env.GOOGLE_API_KEY,
                },
                timeout: 10000, // Longer timeout for URL resolution
            })

            if (response.data.status !== 'OK') {
                logger.warn(
                    { url, status: response.data.status, errorMessage: response.data.error_message },
                    'Geocoding API returned non-OK status for URL'
                )
                return null
            }

            const location = response.data.results[0]?.geometry?.location
            if (!location) {
                logger.warn({ url }, 'Geocoding API returned no results for URL')
                return null
            }

            const coordinates: Coordinates = {
                latitude: location.lat,
                longitude: location.lng,
            }

            logger.info({ url, coordinates, method: 'geocoding-api' }, 'Successfully resolved URL to coordinates via API')
            return coordinates
        } catch (error) {
            logger.error({ err: error, url }, 'Failed to resolve URL to coordinates via API')
            return null
        }
    }

    /**
     * Geocode an address or place name to coordinates
     * @param address - Address or place name (e.g., "Times Square, New York")
     * @returns Coordinates or null if geocoding fails
     */
    async geocodeAddress(address: string): Promise<Coordinates | null> {
        if (!this.enabled) {
            logger.warn('Google Maps service is disabled')
            return null
        }

        try {
            logger.debug({ address }, 'Geocoding address to coordinates')

            const response = await this.client.geocode({
                params: {
                    address,
                    key: env.GOOGLE_API_KEY,
                },
                timeout: 5000,
            })

            if (response.data.status !== 'OK') {
                logger.warn(
                    { address, status: response.data.status, errorMessage: response.data.error_message },
                    'Geocoding API returned non-OK status'
                )
                return null
            }

            const location = response.data.results[0]?.geometry?.location
            if (!location) {
                logger.warn({ address }, 'Geocoding API returned no results')
                return null
            }

            const coordinates: Coordinates = {
                latitude: location.lat,
                longitude: location.lng,
            }

            logger.info({ address, coordinates }, 'Successfully geocoded address to coordinates')
            return coordinates
        } catch (error) {
            logger.error({ err: error, address }, 'Failed to geocode address to coordinates')
            return null
        }
    }
}

// Export singleton instance
export const googleMapsService = new GoogleMapsService()
