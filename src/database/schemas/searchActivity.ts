/**
 * Search Activity Schema
 *
 * Tracks ISP customer searches by workers/collectors for admin oversight.
 */

export interface SearchActivity {
    id: string
    user_telegram_id: string
    worker_username: string | null
    user_display_name: string | null
    search_identifier: string
    identifier_type: 'phone' | 'username'
    results_count: number
    search_successful: boolean
    customer_usernames: string[] | null
    response_time_ms: number | null
    context_type: 'private' | 'group'
    metadata: Record<string, unknown>
    created_at: Date
}

/**
 * Input for creating search activity record
 */
export interface CreateSearchActivityInput {
    user_telegram_id: string
    worker_username?: string | null
    user_display_name?: string | null
    search_identifier: string
    identifier_type: 'phone' | 'username'
    results_count: number
    search_successful: boolean
    customer_usernames?: string[] | null
    response_time_ms?: number | null
    context_type?: 'private' | 'group'
    metadata?: Record<string, unknown>
}

/**
 * Summary of search activity for a user
 */
export interface UserSearchSummary {
    worker_username: string | null
    user_display_name: string | null
    user_telegram_id: string
    total_searches: number
    successful_searches: number
    unique_identifiers: number
    last_search_at: Date
}

/**
 * Daily search activity summary
 */
export interface DailySearchSummary {
    date: string
    total_searches: number
    unique_users: number
    successful_searches: number
}
