/**
 * Telegram User Mapping Schema
 * Maps worker usernames (from billing system) to Telegram IDs for webhook notifications
 *
 * Column naming:
 * - worker_username: Worker username from billing system (derived from first_name)
 * - telegram_id: Telegram numeric user ID (permanent identifier)
 * - telegram_handle: Telegram @username (optional, can change)
 */

export interface TelegramUserMapping {
    id: string
    worker_username: string
    telegram_id: string
    telegram_handle?: string | null
    first_name?: string | null
    last_name?: string | null
    created_at: Date
    updated_at: Date
}

export interface CreateTelegramUserMapping {
    worker_username: string
    telegram_id: string
    telegram_handle?: string
    first_name?: string
    last_name?: string
}

export interface UpdateTelegramUserMapping {
    telegram_id?: string
    telegram_handle?: string
    first_name?: string
    last_name?: string
}
