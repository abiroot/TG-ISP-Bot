/**
 * User identifier mapping between Telegram user IDs and usernames
 * Enables username whitelisting functionality
 */

export interface UserIdentifier {
    id: string
    telegram_id: string
    username?: string
    first_name?: string
    last_name?: string
    display_name?: string
    push_name?: string
    is_active: boolean
    created_at: Date
    updated_at: Date
}

export interface CreateUserIdentifier {
    telegram_id: string
    username?: string
    first_name?: string
    last_name?: string
    display_name?: string
    push_name?: string
}

export interface UpdateUserIdentifier {
    username?: string
    first_name?: string
    last_name?: string
    display_name?: string
    push_name?: string
    is_active?: boolean
}