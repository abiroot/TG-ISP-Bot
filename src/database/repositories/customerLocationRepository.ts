/**
 * Customer Location Repository
 *
 * Data access layer for customer location storage.
 * Used by money collectors to track ISP customer coordinates.
 */

import { pool } from '~/config/database'
import type {
    CustomerLocation,
    CustomerLocationInput,
} from '~/database/schemas/customerLocation'
import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('customer-location-repo')

/**
 * Update or insert customer location
 * Uses UPSERT pattern to update existing or create new record
 */
export async function upsertCustomerLocation(
    input: CustomerLocationInput
): Promise<CustomerLocation | null> {
    try {
        const result = await pool.query<CustomerLocation>(
            `INSERT INTO customer_locations (
                isp_username,
                latitude,
                longitude,
                updated_by_telegram_id,
                updated_by_name,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (isp_username)
            DO UPDATE SET
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                updated_by_telegram_id = EXCLUDED.updated_by_telegram_id,
                updated_by_name = EXCLUDED.updated_by_name,
                updated_at = NOW()
            RETURNING *`,
            [
                input.isp_username,
                input.latitude,
                input.longitude,
                input.updated_by_telegram_id,
                input.updated_by_name || null,
            ]
        )

        logger.info(
            { username: input.isp_username, updatedBy: input.updated_by_telegram_id },
            'Customer location upserted'
        )

        return result.rows[0] || null
    } catch (error) {
        logger.error({ err: error, input }, 'Failed to upsert customer location')
        return null
    }
}

/**
 * Update multiple customer locations to the same coordinates
 * Returns count of successfully updated records
 */
export async function upsertMultipleCustomerLocations(
    usernames: string[],
    latitude: number,
    longitude: number,
    updatedByTelegramId: string,
    updatedByName?: string | null
): Promise<{ updated: number; failed: string[] }> {
    const updated: string[] = []
    const failed: string[] = []

    for (const username of usernames) {
        const result = await upsertCustomerLocation({
            isp_username: username,
            latitude,
            longitude,
            updated_by_telegram_id: updatedByTelegramId,
            updated_by_name: updatedByName,
        })

        if (result) {
            updated.push(username)
        } else {
            failed.push(username)
        }
    }

    logger.info(
        { total: usernames.length, updated: updated.length, failed: failed.length },
        'Batch location update completed'
    )

    return { updated: updated.length, failed }
}

/**
 * Get customer location by ISP username
 */
export async function getCustomerLocation(
    ispUsername: string
): Promise<CustomerLocation | null> {
    try {
        const result = await pool.query<CustomerLocation>(
            `SELECT * FROM customer_locations WHERE isp_username = $1`,
            [ispUsername]
        )

        return result.rows[0] || null
    } catch (error) {
        logger.error({ err: error, username: ispUsername }, 'Failed to get customer location')
        return null
    }
}

/**
 * Get all locations updated by a specific Telegram user
 */
export async function getLocationsByUpdater(
    telegramId: string
): Promise<CustomerLocation[]> {
    try {
        const result = await pool.query<CustomerLocation>(
            `SELECT * FROM customer_locations
             WHERE updated_by_telegram_id = $1
             ORDER BY updated_at DESC`,
            [telegramId]
        )

        return result.rows
    } catch (error) {
        logger.error(
            { err: error, telegramId },
            'Failed to get locations by updater'
        )
        return []
    }
}

/**
 * Get recent location updates (last N records)
 */
export async function getRecentLocationUpdates(limit: number = 10): Promise<CustomerLocation[]> {
    try {
        const result = await pool.query<CustomerLocation>(
            `SELECT * FROM customer_locations
             ORDER BY updated_at DESC
             LIMIT $1`,
            [limit]
        )

        return result.rows
    } catch (error) {
        logger.error({ err: error, limit }, 'Failed to get recent location updates')
        return []
    }
}

/**
 * Delete customer location
 */
export async function deleteCustomerLocation(ispUsername: string): Promise<boolean> {
    try {
        const result = await pool.query(
            `DELETE FROM customer_locations WHERE isp_username = $1`,
            [ispUsername]
        )

        const deleted = result.rowCount ? result.rowCount > 0 : false
        logger.info({ username: ispUsername, deleted }, 'Customer location deleted')

        return deleted
    } catch (error) {
        logger.error({ err: error, username: ispUsername }, 'Failed to delete customer location')
        return false
    }
}
