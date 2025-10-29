/**
 * Extensions Helper
 *
 * Provides type-safe access to BuilderBot extensions (dependency injection)
 *
 * @example
 * ```ts
 * // Basic usage
 * const { aiService, messageService } = getExtensions(utils)
 *
 * // With safety check
 * if (hasExtensions(utils)) {
 *     const { aiService } = getExtensions(utils)
 * }
 *
 * // Get specific service
 * const aiService = getExtension(utils, 'aiService')
 *
 * // Wrap flow action
 * .addAction(withExtensions(async (ctx, utils) => {
 *     const { aiService } = utils.extensions
 *     await aiService.chat(ctx.body)
 * }))
 * ```
 */

import { BotUtils, RequiredServiceExtensions } from '~/types'

/**
 * Type guard to check if extensions exist and are properly initialized
 *
 * @param utils - Bot utils object from flow callback
 * @returns True if extensions exist, false otherwise
 */
export function hasExtensions(utils: BotUtils): utils is BotUtils & { extensions: RequiredServiceExtensions } {
    return !!utils.extensions && typeof utils.extensions === 'object'
}

/**
 * Get extensions from BotUtils with type safety
 *
 * @param utils - Bot utils object from flow callback
 * @returns Required extensions object with all services
 * @throws Error if extensions are not available
 */
export function getExtensions(utils: BotUtils): RequiredServiceExtensions {
    if (!hasExtensions(utils)) {
        throw new Error('Extensions not available. Ensure createBot() is configured with extensions.')
    }

    return utils.extensions as RequiredServiceExtensions
}

/**
 * Safely get a specific extension service
 *
 * @param utils - Bot utils object from flow callback
 * @param serviceName - Name of the service to retrieve
 * @returns The requested service
 * @throws Error if service is not available
 *
 * @example
 * ```ts
 * const aiService = getExtension(utils, 'aiService')
 * const response = await aiService.chat(ctx.body)
 * ```
 */
export function getExtension<K extends keyof RequiredServiceExtensions>(
    utils: BotUtils,
    serviceName: K
): RequiredServiceExtensions[K] {
    const extensions = getExtensions(utils)
    const service = extensions[serviceName]

    if (!service) {
        throw new Error(`Service "${serviceName}" not available in extensions`)
    }

    return service
}

/**
 * Higher-order function to create flow actions with guaranteed extensions
 *
 * Wraps a flow action to ensure extensions are available before execution
 * and provides proper TypeScript typing
 *
 * @param action - Flow action that requires extensions
 * @returns Wrapped action with extension safety check
 *
 * @example
 * ```ts
 * const myFlow = addKeyword('hello')
 *     .addAction(withExtensions(async (ctx, utils) => {
 *         // utils.extensions is guaranteed to exist here
 *         const { aiService } = utils.extensions
 *         const response = await aiService.chat(ctx.body)
 *         await utils.flowDynamic(response)
 *     }))
 * ```
 */
export function withExtensions<T extends BotUtils>(
    action: (ctx: any, utils: T & { extensions: RequiredServiceExtensions }) => Promise<void> | void
) {
    return async (ctx: any, utils: T) => {
        if (!hasExtensions(utils)) {
            console.error('❌ Extensions not available - cannot execute action')
            await utils.flowDynamic('⚠️ Service temporarily unavailable. Please try again.')
            return
        }

        return action(ctx, utils as T & { extensions: RequiredServiceExtensions })
    }
}
