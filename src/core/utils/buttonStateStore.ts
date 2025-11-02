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
    consumed: boolean
    consumedAt?: number
}

// In-memory store: userId -> stateId -> data
const store = new Map<string, Map<string, ButtonState>>()

// Auto-cleanup after 10 minutes
const EXPIRY_MS = 10 * 60 * 1000

// Grace period for consumed data (2 minutes to handle retries)
const CONSUMED_GRACE_PERIOD_MS = 2 * 60 * 1000

/**
 * Store location confirmation data temporarily
 * @returns Short reference ID (e.g., "a1b2c3")
 */
export function storeConfirmationData(
    userId: string | number,
    latitude: number,
    longitude: number,
    usernames: string[]
): string {
    // Normalize userId to string to ensure consistency
    const normalizedUserId = String(userId)

    // Generate short ID (6 chars)
    const stateId = Math.random().toString(36).substring(2, 8)

    // Ensure user map exists
    if (!store.has(normalizedUserId)) {
        store.set(normalizedUserId, new Map())
    }

    const userStore = store.get(normalizedUserId)!

    // Store data
    userStore.set(stateId, {
        latitude,
        longitude,
        usernames,
        createdAt: Date.now(),
        consumed: false,
    })

    logger.info({ userId: normalizedUserId, stateId, usernames, storeSize: store.size }, 'Stored confirmation data')

    // Cleanup old entries (lazy cleanup)
    cleanupExpired(normalizedUserId)

    return stateId
}

/**
 * Retrieve stored confirmation data (idempotent - can be called multiple times)
 * Marks data as consumed on first retrieval but doesn't delete immediately
 */
export function retrieveConfirmationData(
    userId: string | number,
    stateId: string
): ButtonState | null {
    // Normalize userId to string to ensure consistency
    const normalizedUserId = String(userId)

    const userStore = store.get(normalizedUserId)
    if (!userStore) {
        const allUserIds = Array.from(store.keys())
        logger.warn({ userId: normalizedUserId, stateId, allUserIds, storeSize: store.size }, 'User store not found')
        return null
    }

    const data = userStore.get(stateId)
    if (!data) {
        logger.warn({ userId: normalizedUserId, stateId }, 'State data not found')
        return null
    }

    // Check expiry
    if (Date.now() - data.createdAt > EXPIRY_MS) {
        logger.info({ userId: normalizedUserId, stateId }, 'State data expired')
        userStore.delete(stateId)
        return null
    }

    // Mark as consumed on first retrieval (idempotent - returns same data on subsequent calls)
    if (!data.consumed) {
        data.consumed = true
        data.consumedAt = Date.now()
        logger.debug({ userId: normalizedUserId, stateId, usernames: data.usernames }, 'Retrieved and marked confirmation data as consumed')
    } else {
        logger.debug({ userId: normalizedUserId, stateId, usernames: data.usernames }, 'Retrieved already-consumed confirmation data (idempotent)')
    }

    return data
}

/**
 * Clear all stored data for a user
 */
export function clearUserData(userId: string | number): void {
    const normalizedUserId = String(userId)
    const deleted = store.delete(normalizedUserId)
    if (deleted) {
        logger.debug({ userId: normalizedUserId }, 'Cleared user confirmation data')
    }
}

/**
 * Delete a specific state entry (useful for explicit cleanup after successful operation)
 */
export function deleteConfirmationData(userId: string | number, stateId: string): void {
    const normalizedUserId = String(userId)
    const userStore = store.get(normalizedUserId)
    if (!userStore) return

    const deleted = userStore.delete(stateId)
    if (deleted) {
        logger.debug({ userId: normalizedUserId, stateId }, 'Explicitly deleted confirmation data')
    }

    // Remove user map if empty
    if (userStore.size === 0) {
        store.delete(normalizedUserId)
    }
}

/**
 * Remove expired entries and consumed entries past grace period
 */
function cleanupExpired(userId: string | number): void {
    const normalizedUserId = String(userId)
    const userStore = store.get(normalizedUserId)
    if (!userStore) return

    const now = Date.now()
    let cleanedExpired = 0
    let cleanedConsumed = 0

    for (const [stateId, data] of userStore.entries()) {
        // Remove expired data (created more than 10 minutes ago)
        if (now - data.createdAt > EXPIRY_MS) {
            userStore.delete(stateId)
            cleanedExpired++
            continue
        }

        // Remove consumed data after grace period (2 minutes after consumption)
        if (data.consumed && data.consumedAt && now - data.consumedAt > CONSUMED_GRACE_PERIOD_MS) {
            userStore.delete(stateId)
            cleanedConsumed++
        }
    }

    if (cleanedExpired > 0 || cleanedConsumed > 0) {
        logger.debug({ userId: normalizedUserId, cleanedExpired, cleanedConsumed }, 'Cleaned up confirmation data')
    }

    // Remove user map if empty
    if (userStore.size === 0) {
        store.delete(normalizedUserId)
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
