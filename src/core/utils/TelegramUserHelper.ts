/**
 * TelegramUserHelper - Unified utility for extracting Telegram user data
 *
 * Centralizes all Telegram user data extraction logic to ensure consistency
 * and reduce duplication across the codebase.
 *
 * Usage:
 *   const userData = TelegramUserHelper.extractUserData(ctx)
 *   const telegramId = TelegramUserHelper.getTelegramId(ctx)
 *   const isGroup = TelegramUserHelper.isGroupContext(ctx)
 */

import type { BotContext } from '~/types'
import type {
    TelegramUserData,
    TelegramIdentifier,
    TelegramContextType,
} from '~/core/types/telegram'
import { getContextType, normalizeTelegramHandle } from '~/core/types/telegram'

export class TelegramUserHelper {
    /**
     * Extract complete Telegram user data from BuilderBot context
     * Single source of truth for user data extraction
     *
     * @param ctx - BuilderBot context
     * @returns Complete Telegram user data
     */
    static extractUserData(ctx: BotContext): TelegramUserData {
        const telegramId = this.getTelegramId(ctx)
        const firstName = this.getFirstName(ctx)
        const lastName = this.getLastName(ctx)
        const telegramHandle = this.getTelegramHandle(ctx)
        const workerUsername = this.getWorkerUsername(ctx)
        const contextType = this.getContextType(ctx)

        return {
            telegramId,
            firstName,
            lastName,
            telegramHandle,
            workerUsername,
            contextType,
        }
    }

    /**
     * Get Telegram numeric user ID (primary identifier)
     *
     * @param ctx - BuilderBot context
     * @returns Telegram ID as string
     */
    static getTelegramId(ctx: BotContext): TelegramIdentifier {
        return String(ctx.from)
    }

    /**
     * Get user's first name from Telegram profile
     * Falls back to Telegram API data if ctx.name is unavailable
     *
     * @param ctx - BuilderBot context
     * @returns First name or undefined
     */
    static getFirstName(ctx: BotContext): string | undefined {
        // Primary source: ctx.name
        if (ctx.name) {
            return ctx.name
        }

        // Fallback: Extract from Telegram API update
        try {
            const firstName = ctx.messageCtx?.update?.message?.from?.first_name
            return firstName || undefined
        } catch {
            return undefined
        }
    }

    /**
     * Get user's last name from Telegram profile
     *
     * @param ctx - BuilderBot context
     * @returns Last name or undefined
     */
    static getLastName(ctx: BotContext): string | undefined {
        try {
            const lastName = ctx.messageCtx?.update?.message?.from?.last_name
            return lastName || undefined
        } catch {
            return undefined
        }
    }

    /**
     * Get Telegram @username (optional, can change)
     * Not recommended as primary identifier
     *
     * @param ctx - BuilderBot context
     * @returns Telegram handle (without @ prefix) or undefined
     */
    static getTelegramHandle(ctx: BotContext): string | undefined {
        // Primary source: ctx.username (typed as any due to BuilderBot limitations)
        const ctxUsername = (ctx as any).username

        if (ctxUsername) {
            return normalizeTelegramHandle(ctxUsername)
        }

        // Fallback: Extract from Telegram API update
        try {
            const apiUsername = ctx.messageCtx?.update?.message?.from?.username
            return normalizeTelegramHandle(apiUsername)
        } catch {
            return undefined
        }
    }

    /**
     * Derive worker username for billing system
     * Format: lowercase first_name with no spaces
     * Fallback: "user_{telegram_id}" if name unavailable
     *
     * @param ctx - BuilderBot context
     * @returns Worker username for billing system mapping
     */
    static getWorkerUsername(ctx: BotContext): string {
        const firstName = this.getFirstName(ctx)

        if (!firstName) {
            // Fallback: Use telegram_id as username
            const telegramId = this.getTelegramId(ctx)
            return `user_${telegramId}`
        }

        // Normalize: lowercase, remove spaces
        const normalized = firstName.toLowerCase().replace(/\s+/g, '')

        // If normalization results in empty string, use fallback
        if (!normalized) {
            const telegramId = this.getTelegramId(ctx)
            return `user_${telegramId}`
        }

        return normalized
    }

    /**
     * Get context type (private or group chat)
     *
     * @param ctx - BuilderBot context
     * @returns Context type
     */
    static getContextType(ctx: BotContext): TelegramContextType {
        const telegramId = this.getTelegramId(ctx)
        return getContextType(telegramId)
    }

    /**
     * Check if context is a group chat
     *
     * @param ctx - BuilderBot context
     * @returns True if group chat, false if private chat
     */
    static isGroupContext(ctx: BotContext): boolean {
        return this.getContextType(ctx) === 'group'
    }

    /**
     * Check if context is a private chat
     *
     * @param ctx - BuilderBot context
     * @returns True if private chat, false if group chat
     */
    static isPrivateContext(ctx: BotContext): boolean {
        return this.getContextType(ctx) === 'private'
    }

    /**
     * Get full display name (first + last name)
     *
     * @param ctx - BuilderBot context
     * @returns Full name or "Unknown User"
     */
    static getFullName(ctx: BotContext): string {
        const firstName = this.getFirstName(ctx)
        const lastName = this.getLastName(ctx)

        if (!firstName) {
            return 'Unknown User'
        }

        if (lastName) {
            return `${firstName} ${lastName}`
        }

        return firstName
    }

    /**
     * Format user mention for display
     * Returns @username if available, otherwise full name
     *
     * @param ctx - BuilderBot context
     * @returns User mention string
     */
    static getUserMention(ctx: BotContext): string {
        const telegramHandle = this.getTelegramHandle(ctx)

        if (telegramHandle) {
            return `@${telegramHandle}`
        }

        return this.getFullName(ctx)
    }
}
