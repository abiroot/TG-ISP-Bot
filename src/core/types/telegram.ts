/**
 * Telegram User Management Types
 *
 * Centralized type definitions for Telegram user data and identifiers.
 * These types ensure type safety and consistency across the codebase.
 */

/**
 * Telegram numeric user ID or group chat ID
 * - Private chats: "123456789" (user ID)
 * - Group chats: "-1001234567890" (group ID, starts with -)
 */
export type TelegramIdentifier = string

/**
 * Context type based on Telegram ID
 */
export type TelegramContextType = 'private' | 'group'

/**
 * Complete Telegram user data extracted from BuilderBot context
 */
export interface TelegramUserData {
    /** Telegram numeric user ID (primary identifier) */
    telegramId: TelegramIdentifier
    /** User's first name from Telegram profile */
    firstName?: string
    /** User's last name from Telegram profile (optional) */
    lastName?: string
    /** Telegram @username (optional, can change) */
    telegramHandle?: string
    /** Derived worker username for billing system (lowercase first_name) */
    workerUsername: string
    /** Context type (private or group chat) */
    contextType: TelegramContextType
}

/**
 * Database schema for telegram_user_mapping table (updated column names)
 */
export interface TelegramUserMapping {
    id: string
    /** Worker username from billing system (derived from first_name) */
    worker_username: string
    /** Telegram numeric user ID (permanent identifier) */
    telegram_id: string
    /** Telegram @username (optional, can change) */
    telegram_handle: string | null
    /** First name from Telegram profile */
    first_name: string | null
    /** Last name from Telegram profile */
    last_name: string | null
    created_at: Date
    updated_at: Date
}

/**
 * Webhook payload structure from ISP billing system
 */
export interface ISPWebhookPayload {
    /** Worker username from billing system */
    worker_username: string
    /** Client username from billing system */
    client_username: string
    /** Telegram username field added to worker profile (optional) */
    tg_username?: string
}

/**
 * Type guard to check if a Telegram ID represents a group chat
 */
export function isGroupId(telegramId: TelegramIdentifier): boolean {
    return telegramId.startsWith('-')
}

/**
 * Type guard to check if a Telegram ID represents a private chat
 */
export function isPrivateId(telegramId: TelegramIdentifier): boolean {
    return !telegramId.startsWith('-')
}

/**
 * Get context type from Telegram ID
 */
export function getContextType(telegramId: TelegramIdentifier): TelegramContextType {
    return isGroupId(telegramId) ? 'group' : 'private'
}

/**
 * Normalize Telegram handle (remove @ prefix if present)
 */
export function normalizeTelegramHandle(handle: string | undefined): string | undefined {
    if (!handle) return undefined
    return handle.startsWith('@') ? handle.slice(1) : handle
}

/**
 * Format Telegram handle with @ prefix
 */
export function formatTelegramHandle(handle: string | undefined): string | undefined {
    if (!handle) return undefined
    return handle.startsWith('@') ? handle : `@${handle}`
}
