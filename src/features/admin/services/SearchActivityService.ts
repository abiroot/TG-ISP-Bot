/**
 * Search Activity Service
 *
 * Handles:
 * - Recording customer search activity
 * - Admin reporting for search oversight
 * - Search analytics and statistics
 *
 * Benefits:
 * - Admin visibility into worker/collector search patterns
 * - Compliance and audit trail
 * - Usage analytics
 */

import { searchActivityRepository } from '~/database/repositories/searchActivityRepository'
import { telegramUserRepository } from '~/database/repositories/telegramUserRepository'
import { createFlowLogger } from '~/core/utils/logger'
import type {
    CreateSearchActivityInput,
    SearchActivity,
    UserSearchSummary,
    DailySearchSummary,
} from '~/database/schemas/searchActivity'

const logger = createFlowLogger('search-activity-service')

/**
 * Parameters for recording a search
 */
export interface RecordSearchParams {
    userTelegramId: string
    searchIdentifier: string
    identifierType: 'phone' | 'username'
    resultsCount: number
    searchSuccessful: boolean
    customerUsernames?: string[]
    responseTimeMs?: number
    contextType?: 'private' | 'group'
}

/**
 * Search activity report for admin
 */
export interface SearchActivityReport {
    period: {
        startDate: Date
        endDate: Date
        days: number
    }
    summary: {
        totalSearches: number
        uniqueUsers: number
        successfulSearches: number
        successRate: number
    }
    userSummaries: UserSearchSummary[]
    dailyBreakdown: DailySearchSummary[]
    recentSearches: SearchActivity[]
}

/**
 * Search Activity Service
 *
 * Provides search activity recording and admin reporting
 */
export class SearchActivityService {
    /**
     * Record a customer search
     * Called when a worker/collector searches for a customer
     */
    async recordSearch(params: RecordSearchParams): Promise<void> {
        try {
            // Get worker username from telegram_user_mapping
            const userMapping = await telegramUserRepository.getUserByTelegramId(params.userTelegramId)

            const input: CreateSearchActivityInput = {
                user_telegram_id: params.userTelegramId,
                worker_username: userMapping?.worker_username || null,
                user_display_name: userMapping?.first_name
                    ? `${userMapping.first_name}${userMapping.last_name ? ' ' + userMapping.last_name : ''}`
                    : null,
                search_identifier: params.searchIdentifier,
                identifier_type: params.identifierType,
                results_count: params.resultsCount,
                search_successful: params.searchSuccessful,
                customer_usernames: params.customerUsernames || null,
                response_time_ms: params.responseTimeMs || null,
                context_type: params.contextType || 'private',
            }

            await searchActivityRepository.create(input)

            logger.debug(
                {
                    userId: params.userTelegramId,
                    identifier: params.searchIdentifier,
                    resultsCount: params.resultsCount,
                },
                'Search activity recorded'
            )
        } catch (error) {
            logger.error({ err: error, params }, 'Failed to record search activity')
            // Don't throw - recording failures shouldn't break search functionality
        }
    }

    /**
     * Get search activity report for admin
     * Default: last 7 days
     */
    async getSearchReport(days: number = 7): Promise<SearchActivityReport> {
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        try {
            // Get all data in parallel
            const [userSummaries, dailyBreakdown, recentSearches, totalCount] = await Promise.all([
                searchActivityRepository.getUserSummaries(days),
                searchActivityRepository.getDailySummaries(days),
                searchActivityRepository.getRecentSearches(20),
                searchActivityRepository.getTotalCount(startDate, endDate),
            ])

            // Calculate summary stats
            const uniqueUsers = userSummaries.length
            const successfulSearches = userSummaries.reduce((sum, u) => sum + u.successful_searches, 0)
            const successRate = totalCount > 0 ? (successfulSearches / totalCount) * 100 : 0

            return {
                period: {
                    startDate,
                    endDate,
                    days,
                },
                summary: {
                    totalSearches: totalCount,
                    uniqueUsers,
                    successfulSearches,
                    successRate: parseFloat(successRate.toFixed(1)),
                },
                userSummaries,
                dailyBreakdown,
                recentSearches,
            }
        } catch (error) {
            logger.error({ err: error, days }, 'Failed to generate search report')
            throw error
        }
    }

    /**
     * Get search activity for a specific user
     */
    async getUserSearchActivity(
        userTelegramId: string,
        days: number = 7
    ): Promise<SearchActivity[]> {
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        return searchActivityRepository.getByUser(userTelegramId, startDate)
    }

    /**
     * Get user summaries only (for quick overview)
     */
    async getUserSummaries(days: number = 7): Promise<UserSearchSummary[]> {
        return searchActivityRepository.getUserSummaries(days)
    }

    /**
     * Get daily breakdown only
     */
    async getDailyBreakdown(days: number = 7): Promise<DailySearchSummary[]> {
        return searchActivityRepository.getDailySummaries(days)
    }

    /**
     * Get recent searches (for live monitoring)
     */
    async getRecentSearches(limit: number = 20): Promise<SearchActivity[]> {
        return searchActivityRepository.getRecentSearches(limit)
    }

    /**
     * Cleanup old records (data retention)
     */
    async cleanupOldRecords(daysToKeep: number = 90): Promise<number> {
        return searchActivityRepository.deleteOldRecords(daysToKeep)
    }
}

/**
 * Singleton instance
 */
export const searchActivityService = new SearchActivityService()
