import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'

// Core bot types
export type BotCtx = BotContext

/**
 * Optional service extensions (for initialization)
 * Use this type when defining extensions at bot creation
 */
export interface ServiceExtensions {
    // V2 Services - primary names only
    coreAIService?: typeof import('~/services/v2/CoreAIService').CoreAIService
    ispService?: typeof import('~/services/v2/ISPService').ISPService
    userManagementService?: typeof import('~/services/v2/UserManagementService').UserManagementService
    mediaService?: typeof import('~/services/v2/MediaService').MediaService
    auditService?: typeof import('~/services/v2/AuditService').AuditService
    botStateService?: typeof import('~/services/v2/EnhancedBotStateService').EnhancedBotStateService

    // Shared service
    messageService?: typeof import('~/services/messageService').messageService
}

/**
 * Required service extensions (for flow usage)
 * Use this type in flows where extensions are guaranteed to exist
 *
 * This enforces type safety by making all services non-optional
 * after bot initialization completes
 */
export interface RequiredServiceExtensions extends Required<ServiceExtensions> {}

/**
 * Bot utils with optional extensions (for general use)
 * Used during initialization or in contexts where extensions might not be available
 */
export type BotUtils = BotMethods<TelegramProvider, Database> & {
    extensions?: ServiceExtensions
}

/**
 * Bot utils with required extensions (for flow callbacks)
 * Used in flow actions where extensions are guaranteed to exist
 *
 * @example
 * ```ts
 * .addAction(async (ctx, utils: BotUtilsWithExtensions) => {
 *     const { aiService } = utils.extensions // No need for optional chaining
 *     await aiService.chat(ctx.body)
 * })
 * ```
 */
export type BotUtilsWithExtensions = BotMethods<TelegramProvider, Database> & {
    extensions: RequiredServiceExtensions
}

// Extended context with guaranteed properties
export interface ExtendedBotContext extends BotCtx {
    from: string
    body: string
    name?: string
    pushName?: string
    id?: string
}

// Legacy support
export interface MessageContext {
    from: string
    body: string
    name?: string
    pushName?: string
}

export interface AdminCommand {
    command: string
    args: string[]
    sender: string
}

// Flow types
export type FlowActionHandler = (ctx: BotCtx, utils: BotUtils) => Promise<void> | void
export type FlowAnswerHandler = (ctx: BotCtx, utils: BotUtils) => Promise<void> | void

/**
 * Flow action handler with guaranteed extensions
 * Use this type in flows that require extensions access
 */
export type FlowActionWithExtensions = (ctx: BotCtx, utils: BotUtilsWithExtensions) => Promise<void> | void

// Middleware types
export type MiddlewareHandler = (ctx: BotCtx, utils: BotUtils) => Promise<boolean>
export type AsyncMiddleware = (ctx: BotCtx, utils: BotUtils) => Promise<void>

// Event payload types
export interface IncomingMessagePayload {
    body: string
    from: string
    id?: string
    name?: string
    pushName?: string
}

export interface OutgoingMessagePayload {
    answer: string
    from: string
}

// JSON-safe types for metadata
export type JsonPrimitive = string | number | boolean | null
export type JsonObject = { [key: string]: JsonValue }
export type JsonArray = JsonValue[]
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

// Extended JSON value that allows objects without index signatures (for buttons, etc.)
export type ExtendedJsonValue = JsonValue | Record<string, unknown> | Array<Record<string, unknown>>

// Database row types (generic, can be extended by repositories)
export interface DatabaseRow {
    [key: string]: JsonValue | Date | undefined
}

// Bot instance type for custom events
export interface BotInstance {
    dispatch?: (event: string, ctx: Partial<BotCtx>) => Promise<void> | void
    [key: string]: JsonValue | Function | undefined
}

// Personality type (re-export for convenience)
export type { Personality } from '~/database/schemas/personality'
export type { Message } from '~/database/schemas/message'
