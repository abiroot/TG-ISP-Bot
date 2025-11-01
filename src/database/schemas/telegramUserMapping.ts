/**
 * Telegram User Mapping Schema
 * Maps worker usernames to Telegram IDs for webhook notifications
 */

export interface TelegramUserMapping {
    id: number
    username: string
    telegram_id: string
    telegram_username?: string | null
    first_name?: string | null
    last_name?: string | null
    created_at: Date
    updated_at: Date
}

export interface CreateTelegramUserMapping {
    username: string
    telegram_id: string
    telegram_username?: string
    first_name?: string
    last_name?: string
}

export interface UpdateTelegramUserMapping {
    telegram_id?: string
    telegram_username?: string
    first_name?: string
    last_name?: string
}
