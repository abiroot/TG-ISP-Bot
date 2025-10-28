import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'

// Core bot types
export type BotCtx = BotContext
export type BotUtils = BotMethods<any, any> & {
    extensions?: ServiceExtensions
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

// Middleware types
export type MiddlewareHandler = (ctx: BotCtx, utils: BotUtils) => Promise<boolean>
export type AsyncMiddleware = (ctx: BotCtx, utils: BotUtils) => Promise<void>

// Service extension types (for future use with extensions pattern)
export interface ServiceExtensions {
    aiService?: typeof import('~/services/aiService').aiService
    messageService?: typeof import('~/services/messageService').messageService
    personalityService?: typeof import('~/services/personalityService').personalityService
    whitelistService?: typeof import('~/services/whitelistService').whitelistService
    botStateService?: typeof import('~/services/botStateService').botStateService
}

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
