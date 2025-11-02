/**
 * Location Service
 *
 * Orchestrates customer location updates:
 * 1. Validates usernames via ISP API
 * 2. Stores coordinates in local database
 * 3. Syncs coordinates to ISP API system
 *
 * Used by money collectors to track ISP customer locations.
 */

import type { ISPService } from '~/features/isp/services/ISPService.js'
import {
    upsertCustomerLocation,
    upsertMultipleCustomerLocations,
} from '~/database/repositories/customerLocationRepository'
import type {
    LocationUpdateResult,
    BatchLocationUpdateResult,
} from '~/database/schemas/customerLocation'
import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('location-service')

export class LocationService {
    private ispService: ISPService

    constructor(ispService: ISPService) {
        this.ispService = ispService
    }

    /**
     * PERFORMANCE NOTE: We skip pre-verification of usernames because
     * the /user-info endpoint takes ~1 minute to respond (includes ping).
     * Instead, we rely on the /update-user-location API which returns
     * false immediately if the username doesn't exist.
     */

    /**
     * Update customer location (both local DB and ISP API)
     *
     * Strategy: Try API update first (fast fail if user doesn't exist),
     * then save to local DB only if API confirms username is valid.
     */
    async updateCustomerLocation(
        username: string,
        latitude: number,
        longitude: number,
        updatedBy: string,
        updatedByName?: string
    ): Promise<LocationUpdateResult> {
        let localSaved = false
        let apiSynced = false
        let error: string | undefined

        try {
            // Step 1: Try ISP API update first (fast - returns false if user doesn't exist)
            try {
                const apiResult = await this.ispService.updateUserLocation(username, latitude, longitude)
                if (apiResult.success) {
                    apiSynced = true
                    logger.info({ username }, 'Location synced to ISP API')
                } else {
                    // API returned false - user doesn't exist
                    error = apiResult.error || 'Username not found in ISP system'
                    logger.warn({ username, error: apiResult.error }, 'ISP API update failed')
                    return {
                        success: false,
                        username,
                        error,
                        local_saved: false,
                        api_synced: false,
                    }
                }
            } catch (apiError) {
                error = 'ISP API error'
                logger.error({ err: apiError, username }, 'ISP API sync error')
                // Don't return yet - still try to save locally
            }

            // Step 2: Save to local database (only if API sync succeeded)
            if (apiSynced) {
                const localResult = await upsertCustomerLocation({
                    isp_username: username,
                    latitude,
                    longitude,
                    updated_by_telegram_id: updatedBy,
                    updated_by_name: updatedByName,
                })

                if (localResult) {
                    localSaved = true
                    logger.info({ username, latitude, longitude }, 'Location saved to local database')
                } else {
                    error = error ? `${error}; Failed to save locally` : 'Failed to save to local database'
                    logger.error({ username }, 'Failed to save location to local database')
                }
            }

            const success = localSaved || apiSynced

            return {
                success,
                username,
                error,
                local_saved: localSaved,
                api_synced: apiSynced,
            }
        } catch (error) {
            logger.error({ err: error, username }, 'Location update failed')
            return {
                success: false,
                username,
                error: 'Unexpected error during location update',
                local_saved: localSaved,
                api_synced: apiSynced,
            }
        }
    }

    /**
     * Update multiple customers to the same location
     *
     * Strategy: Update API first for all usernames, then save to local DB
     * only for usernames that succeeded (exist in ISP system).
     */
    async updateMultipleCustomerLocations(
        usernames: string[],
        latitude: number,
        longitude: number,
        updatedBy: string,
        updatedByName?: string
    ): Promise<BatchLocationUpdateResult> {
        const results: LocationUpdateResult[] = []

        logger.info({ count: usernames.length }, 'Batch location update started')

        // Update ISP API for all usernames (will return false for non-existent users)
        let apiResults: { userName: string; success: boolean; error?: string }[] = []
        try {
            const apiResponse = await this.ispService.batchUpdateLocations(
                usernames.map((userName) => ({ userName, latitude, longitude }))
            )
            apiResults = apiResponse.results
            logger.info({ apiSummary: apiResponse.summary }, 'ISP API batch update completed')
        } catch (apiError) {
            logger.error({ err: apiError }, 'ISP API batch update failed')
            // Create failure results for all usernames
            apiResults = usernames.map((userName) => ({
                userName,
                success: false,
                error: 'ISP API batch update failed',
            }))
        }

        // Extract usernames that succeeded in API update (these users exist)
        const validUsernames = apiResults.filter((r) => r.success).map((r) => r.userName)

        // Update local database for valid usernames only
        let localResult = { updated: 0, failed: [] as string[] }
        if (validUsernames.length > 0) {
            localResult = await upsertMultipleCustomerLocations(
                validUsernames,
                latitude,
                longitude,
                updatedBy,
                updatedByName
            )
            logger.info(
                { validCount: validUsernames.length, localUpdated: localResult.updated },
                'Local database batch update completed'
            )
        }

        // Combine results
        for (const username of usernames) {
            const apiResult = apiResults.find((r) => r.userName === username)
            const apiSynced = apiResult?.success || false
            const localSaved = apiSynced && !localResult.failed.includes(username)

            results.push({
                success: apiSynced && localSaved,
                username,
                error: !apiSynced
                    ? apiResult?.error || 'Username not found in ISP system'
                    : !localSaved
                      ? 'Local save failed'
                      : undefined,
                local_saved: localSaved,
                api_synced: apiSynced,
            })
        }

        const successful = results.filter((r) => r.success).length
        const failed = results.filter((r) => !r.success).length

        logger.info(
            { total: results.length, successful, failed },
            'Batch location update completed'
        )

        return {
            total: usernames.length,
            successful,
            failed,
            results,
        }
    }
}

/**
 * Singleton instance
 *
 * NOTE: This will be initialized with ISPService in app.ts
 * DO NOT use this export directly - it's created on-demand in app.ts
 */
// export const locationService = new LocationService(ispService) // Removed - initialized in app.ts now
