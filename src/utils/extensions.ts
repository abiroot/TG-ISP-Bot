/**
 * Extensions Helper
 *
 * Provides type-safe access to BuilderBot extensions (dependency injection)
 * Usage: const { ai, messageService } = getExtensions(utils)
 */

import { BotUtils, ServiceExtensions } from '~/types'

/**
 * Get extensions from BotUtils with type safety
 * Throws if extensions are not available (should never happen in production)
 */
export function getExtensions(utils: BotUtils): Required<ServiceExtensions> {
    if (!utils.extensions) {
        throw new Error('Extensions not available. Ensure createBot() is configured with extensions.')
    }

    return utils.extensions as Required<ServiceExtensions>
}

/**
 * Check if extensions are available
 */
export function hasExtensions(utils: BotUtils): boolean {
    return !!utils.extensions
}
