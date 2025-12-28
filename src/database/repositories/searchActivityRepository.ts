/**
 * Search Activity Repository
 *
 * Data access layer for customer search activity tracking.
 * Used by admins to monitor worker/collector search patterns.
 */

import { pool } from '~/config/database'
import type {
    SearchActivity,
    CreateSearchActivityInput,
    UserSearchSummary,
    DailySearchSummary,
} from '~/database/schemas/searchActivity'
import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('search-activity-repo')

export class SearchActivityRepository {
    /**
     * Create a new search activity record
     */
    async create(input: CreateSearchActivityInput): Promise<SearchActivity | null> {
        try {
            const result = await pool.query<SearchActivity>(
                `INSERT INTO customer_search_activity (
                    user_telegram_id,
                    worker_username,
                    user_display_name,
                    search_identifier,
                    identifier_type,
                    results_count,
                    search_successful,
                    customer_usernames,
                    response_time_ms,
                    context_type,
                    metadata,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                RETURNING *`,
                [
                    input.user_telegram_id,
                    input.worker_username || null,
                    input.user_display_name || null,
                    input.search_identifier,
                    input.identifier_type,
                    input.results_count,
                    input.search_successful,
                    input.customer_usernames || null,
                    input.response_time_ms || null,
                    input.context_type || 'private',
                    JSON.stringify(input.metadata || {}),
                ]
            )

            logger.debug(
                { userId: input.user_telegram_id, identifier: input.search_identifier },
                'Search activity recorded'
            )

            return result.rows[0] || null
        } catch (error) {
            logger.error({ err: error, input }, 'Failed to create search activity')
            return null
        }
    }

    /**
     * Get search activity by date range
     * Default: last 7 days
     */
    async getByDateRange(
        startDate: Date,
        endDate: Date = new Date(),
        limit: number = 500
    ): Promise<SearchActivity[]> {
        try {
            const result = await pool.query<SearchActivity>(
                `SELECT * FROM customer_search_activity
                 WHERE created_at >= $1 AND created_at <= $2
                 ORDER BY created_at DESC
                 LIMIT $3`,
                [startDate, endDate, limit]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error, startDate, endDate }, 'Failed to get search activity by date range')
            return []
        }
    }

    /**
     * Get search activity for a specific user
     */
    async getByUser(
        userTelegramId: string,
        startDate?: Date,
        limit: number = 100
    ): Promise<SearchActivity[]> {
        try {
            let query = `SELECT * FROM customer_search_activity WHERE user_telegram_id = $1`
            const params: (string | Date | number)[] = [userTelegramId]

            if (startDate) {
                query += ` AND created_at >= $2`
                params.push(startDate)
            }

            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
            params.push(limit)

            const result = await pool.query<SearchActivity>(query, params)
            return result.rows
        } catch (error) {
            logger.error({ err: error, userTelegramId }, 'Failed to get search activity by user')
            return []
        }
    }

    /**
     * Get user search summaries for the last N days
     * Returns aggregated stats per user
     */
    async getUserSummaries(days: number = 7): Promise<UserSearchSummary[]> {
        try {
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - days)

            const result = await pool.query<UserSearchSummary>(
                `SELECT
                    worker_username,
                    user_display_name,
                    user_telegram_id,
                    COUNT(*)::INTEGER as total_searches,
                    COUNT(*) FILTER (WHERE search_successful = true)::INTEGER as successful_searches,
                    COUNT(DISTINCT search_identifier)::INTEGER as unique_identifiers,
                    MAX(created_at) as last_search_at
                 FROM customer_search_activity
                 WHERE created_at >= $1
                 GROUP BY user_telegram_id, worker_username, user_display_name
                 ORDER BY total_searches DESC`,
                [startDate]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error, days }, 'Failed to get user summaries')
            return []
        }
    }

    /**
     * Get daily search summaries for the last N days
     */
    async getDailySummaries(days: number = 7): Promise<DailySearchSummary[]> {
        try {
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - days)

            const result = await pool.query<DailySearchSummary>(
                `SELECT
                    DATE(created_at) as date,
                    COUNT(*)::INTEGER as total_searches,
                    COUNT(DISTINCT user_telegram_id)::INTEGER as unique_users,
                    COUNT(*) FILTER (WHERE search_successful = true)::INTEGER as successful_searches
                 FROM customer_search_activity
                 WHERE created_at >= $1
                 GROUP BY DATE(created_at)
                 ORDER BY date DESC`,
                [startDate]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error, days }, 'Failed to get daily summaries')
            return []
        }
    }

    /**
     * Get recent searches (for quick admin overview)
     */
    async getRecentSearches(limit: number = 20): Promise<SearchActivity[]> {
        try {
            const result = await pool.query<SearchActivity>(
                `SELECT * FROM customer_search_activity
                 ORDER BY created_at DESC
                 LIMIT $1`,
                [limit]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error, limit }, 'Failed to get recent searches')
            return []
        }
    }

    /**
     * Get total search count for a date range
     */
    async getTotalCount(startDate: Date, endDate: Date = new Date()): Promise<number> {
        try {
            const result = await pool.query<{ count: string }>(
                `SELECT COUNT(*) as count
                 FROM customer_search_activity
                 WHERE created_at >= $1 AND created_at <= $2`,
                [startDate, endDate]
            )

            return parseInt(result.rows[0]?.count || '0', 10)
        } catch (error) {
            logger.error({ err: error, startDate, endDate }, 'Failed to get total count')
            return 0
        }
    }

    /**
     * Delete old search activity records (for data retention)
     * Default: delete records older than 90 days
     */
    async deleteOldRecords(daysToKeep: number = 90): Promise<number> {
        try {
            const cutoffDate = new Date()
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

            const result = await pool.query(
                `DELETE FROM customer_search_activity
                 WHERE created_at < $1`,
                [cutoffDate]
            )

            const deletedCount = result.rowCount || 0
            if (deletedCount > 0) {
                logger.info({ deletedCount, daysToKeep }, 'Deleted old search activity records')
            }

            return deletedCount
        } catch (error) {
            logger.error({ err: error, daysToKeep }, 'Failed to delete old records')
            return 0
        }
    }
}

// Export singleton instance
export const searchActivityRepository = new SearchActivityRepository()
