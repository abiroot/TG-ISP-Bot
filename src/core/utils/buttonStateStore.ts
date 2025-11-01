/**
 * Temporary in-memory store for button callback data that exceeds Telegram's 64-byte limit
 *
 * When confirmation data is too large for callback_data, we store it here temporarily
 * and reference it by a short ID in the button callback.
 */

import { createFlowLogger } from './logger'

const logger = createFlowLogger('button-state-store')

interface ButtonState {
    latitude: number
    longitude: number
    usernames: string[]
    createdAt: number
}

// In-memory store: userId -> stateId -> data
const store = new Map<string, Map<string, ButtonState>>()

// Auto-cleanup after 10 minutes
const EXPIRY_MS = 10 * 60 * 1000

/**
 * Store location confirmation data temporarily
 * @returns Short reference ID (e.g., "a1b2c3")
 */
export function storeConfirmationData(
    userId: string,
    latitude: number,
    longitude: number,
    usernames: string[]
): string {
    // Generate short ID (6 chars)
    const stateId = Math.random().toString(36).substring(2, 8)

    // Ensure user map exists
    if (!store.has(userId)) {
        store.set(userId, new Map())
    }

    const userStore = store.get(userId)!

    // Store data
    userStore.set(stateId, {
        latitude,
        longitude,
        usernames,
        createdAt: Date.now(),
    })

    logger.debug({ userId, stateId, usernames }, 'Stored confirmation data')

    // Cleanup old entries (lazy cleanup)
    cleanupExpired(userId)

    return stateId
}

/**
 * Retrieve and remove stored confirmation data
 */
export function retrieveConfirmationData(
    userId: string,
    stateId: string
): ButtonState | null {
    const userStore = store.get(userId)
    if (!userStore) {
        logger.warn({ userId, stateId }, 'User store not found')
        return null
    }

    const data = userStore.get(stateId)
    if (!data) {
        logger.warn({ userId, stateId }, 'State data not found')
        return null
    }

    // Check expiry
    if (Date.now() - data.createdAt > EXPIRY_MS) {
        logger.info({ userId, stateId }, 'State data expired')
        userStore.delete(stateId)
        return null
    }

    // Remove after retrieval (one-time use)
    userStore.delete(stateId)

    logger.debug({ userId, stateId, usernames: data.usernames }, 'Retrieved confirmation data')

    return data
}

/**
 * Clear all stored data for a user
 */
export function clearUserData(userId: string): void {
    const deleted = store.delete(userId)
    if (deleted) {
        logger.debug({ userId }, 'Cleared user confirmation data')
    }
}

/**
 * Remove expired entries for a user
 */
function cleanupExpired(userId: string): void {
    const userStore = store.get(userId)
    if (!userStore) return

    const now = Date.now()
    let cleaned = 0

    for (const [stateId, data] of userStore.entries()) {
        if (now - data.createdAt > EXPIRY_MS) {
            userStore.delete(stateId)
            cleaned++
        }
    }

    if (cleaned > 0) {
        logger.debug({ userId, cleaned }, 'Cleaned up expired confirmation data')
    }

    // Remove user map if empty
    if (userStore.size === 0) {
        store.delete(userId)
    }
}

/**
 * Get store statistics (for debugging)
 */
export function getStoreStats() {
    let totalEntries = 0
    for (const userStore of store.values()) {
        totalEntries += userStore.size
    }
    return {
        users: store.size,
        totalEntries,
    }
}
