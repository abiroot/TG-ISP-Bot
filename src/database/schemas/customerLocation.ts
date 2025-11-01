/**
 * Customer Location Schema
 *
 * Stores ISP customer coordinates updated by money collectors.
 * Coordinates are stored both locally (this table) and sent to ISP API.
 */

export interface CustomerLocation {
    id: string
    isp_username: string
    latitude: number
    longitude: number
    updated_by_telegram_id: string
    updated_by_name: string | null
    created_at: Date
    updated_at: Date
}

/**
 * Input for creating/updating customer location
 */
export interface CustomerLocationInput {
    isp_username: string
    latitude: number
    longitude: number
    updated_by_telegram_id: string
    updated_by_name?: string | null
}

/**
 * Location update result
 */
export interface LocationUpdateResult {
    success: boolean
    username: string
    error?: string
    local_saved: boolean
    api_synced: boolean
}

/**
 * Batch location update result
 */
export interface BatchLocationUpdateResult {
    total: number
    successful: number
    failed: number
    results: LocationUpdateResult[]
}
