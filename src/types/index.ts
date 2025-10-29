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
    aiService?: typeof import('~/services/aiService').aiService
    intentService?: typeof import('~/services/intentService').intentService
    messageService?: typeof import('~/services/messageService').messageService
    personalityService?: typeof import('~/services/personalityService').personalityService
    whitelistService?: typeof import('~/services/whitelistService').whitelistService
    userService?: typeof import('~/services/userService').userService
    botStateService?: typeof import('~/services/botStateService').botStateService
    transcriptionService?: typeof import('~/services/transcriptionService').transcriptionService
    imageAnalysisService?: typeof import('~/services/imageAnalysisService').imageAnalysisService
    conversationRagService?: typeof import('~/services/conversationRagService').conversationRagService
    embeddingWorkerService?: typeof import('~/services/embeddingWorkerService').embeddingWorkerService
    toolExecutionAuditService?: typeof import('~/services/toolExecutionAuditService').toolExecutionAuditService
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
export type BotUtils = BotMethods<any, any> & {
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
export type BotUtilsWithExtensions = BotMethods<any, any> & {
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
