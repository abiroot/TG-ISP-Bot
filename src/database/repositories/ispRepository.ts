import { pool } from '~/config/database'
import type {
    IspQuery,
    CreateIspQuery,
    IspQueryFilter,
    QuerySummary,
    MonthlySummary
} from '~/database/schemas/ispEntry'

export class IspRepository {
    /**
     * Create an ISP query record
     */
    async createQuery(data: CreateIspQuery): Promise<IspQuery> {
        const result = await pool.query(
            `INSERT INTO isp_queries (
                user_phone, context_id, query_type, customer_id, phone_number,
                query_description, api_response, response_time_ms, query_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                data.user_phone,
                data.context_id,
                data.query_type,
                data.customer_id || null,
                data.phone_number || null,
                data.query_description,
                JSON.stringify(data.api_response),
                data.response_time_ms,
                data.query_date ? (typeof data.query_date === 'string' ? data.query_date : data.query_date.toISOString().split('T')[0]) : new Date().toISOString().split('T')[0]
            ]
        )
        return {
            ...result.rows[0],
            api_response: JSON.parse(result.rows[0].api_response),
            query_date: new Date(result.rows[0].query_date),
            created_at: new Date(result.rows[0].created_at)
        }
    }

    /**
     * Get ISP queries with filtering
     */
    async getQueries(filter: IspQueryFilter): Promise<IspQuery[]> {
        let query = `
            SELECT * FROM isp_queries
            WHERE user_phone = $1
        `
        const params = [filter.user_phone]
        let paramIndex = 2

        if (filter.query_type) {
            query += ` AND query_type = $${paramIndex++}`
            params.push(filter.query_type)
        }

        if (filter.customer_id) {
            query += ` AND customer_id = $${paramIndex++}`
            params.push(filter.customer_id)
        }

        if (filter.phone_number) {
            query += ` AND phone_number = $${paramIndex++}`
            params.push(filter.phone_number)
        }

        if (filter.start_date) {
            query += ` AND query_date >= $${paramIndex++}`
            params.push(typeof filter.start_date === 'string' ? filter.start_date : filter.start_date.toISOString().split('T')[0])
        }

        if (filter.end_date) {
            query += ` AND query_date <= $${paramIndex++}`
            params.push(typeof filter.end_date === 'string' ? filter.end_date : filter.end_date.toISOString().split('T')[0])
        }

        query += ` ORDER BY created_at DESC`

        if (filter.limit) {
            query += ` LIMIT $${paramIndex++}`
            params.push(filter.limit.toString())
        }

        if (filter.offset) {
            query += ` OFFSET $${paramIndex++}`
            params.push(filter.offset.toString())
        }

        const result = await pool.query(query, params)
        return result.rows.map(row => ({
            ...row,
            api_response: JSON.parse(row.api_response),
            query_date: new Date(row.query_date),
            created_at: new Date(row.created_at)
        }))
    }

    /**
     * Get query summary analytics
     */
    async getQuerySummary(userPhone: string, startDate?: string, endDate?: string): Promise<QuerySummary[]> {
        let query = `
            SELECT
                query_type,
                COUNT(*) as query_count,
                AVG(response_time_ms) as avg_response_time_ms,
                COUNT(DISTINCT customer_id) as unique_customers_queried
            FROM isp_queries
            WHERE user_phone = $1
        `
        const params = [userPhone]
        let paramIndex = 2

        if (startDate) {
            query += ` AND query_date >= $${paramIndex++}`
            params.push(startDate)
        }

        if (endDate) {
            query += ` AND query_date <= $${paramIndex++}`
            params.push(endDate)
        }

        query += ` GROUP BY query_type ORDER BY query_count DESC`

        const result = await pool.query(query, params)
        return result.rows.map(row => ({
            query_type: row.query_type,
            query_count: parseInt(row.query_count),
            avg_response_time_ms: Math.round(parseFloat(row.avg_response_time_ms)),
            unique_customers_queried: parseInt(row.unique_customers_queried)
        }))
    }

    /**
     * Get monthly summary analytics
     */
    async getMonthlySummary(year: number, month: number, userPhone: string): Promise<MonthlySummary> {
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
        const endDate = `${year}-${month.toString().padStart(2, '0')}-31`

        // Get basic stats
        const statsResult = await pool.query(
            `SELECT
                COUNT(*) as total_queries,
                AVG(response_time_ms) as avg_response_time_ms
            FROM isp_queries
            WHERE user_phone = $1 AND query_date >= $2 AND query_date <= $3`,
            [userPhone, startDate, endDate]
        )

        // Get most queried customers
        const customersResult = await pool.query(
            `SELECT
                customer_id,
                COUNT(*) as query_count
            FROM isp_queries
            WHERE user_phone = $1 AND query_date >= $2 AND query_date <= $3
                AND customer_id IS NOT NULL
            GROUP BY customer_id
            ORDER BY query_count DESC
            LIMIT 5`,
            [userPhone, startDate, endDate]
        )

        // Get query type distribution
        const distributionResult = await pool.query(
            `SELECT
                query_type,
                COUNT(*) as count
            FROM isp_queries
            WHERE user_phone = $1 AND query_date >= $2 AND query_date <= $3
            GROUP BY query_type`,
            [userPhone, startDate, endDate]
        )

        const totalQueries = parseInt(statsResult.rows[0]?.total_queries || '0')
        const avgResponseTime = Math.round(parseFloat(statsResult.rows[0]?.avg_response_time_ms || '0'))

        const mostQueriedCustomers = customersResult.rows.map(row => ({
            customer_id: row.customer_id,
            query_count: parseInt(row.query_count)
        }))

        const queryTypeDistribution: Record<string, number> = {}
        for (const row of distributionResult.rows) {
            queryTypeDistribution[row.query_type] = parseInt(row.count)
        }

        return {
            total_queries: totalQueries,
            avg_response_time_ms: avgResponseTime,
            most_queried_customers: mostQueriedCustomers,
            query_type_distribution: queryTypeDistribution as Record<"customer_info" | "usage_status" | "account_details" | "connection_info", number>
        }
    }

    /**
     * Delete all ISP query data for a user (primarily for testing)
     */
    async deleteAllCustomerData(userPhone: string): Promise<void> {
        await pool.query('DELETE FROM isp_queries WHERE user_phone = $1', [userPhone])
    }

    // Compatibility methods for existing tests (aliases to ISP methods)

    /**
     * Create an entry (alias for createQuery - for test compatibility)
     */
    async createEntry(data: CreateIspQuery): Promise<IspQuery> {
        return await this.createQuery(data)
    }

    /**
     * Get entries (alias for getQueries - for test compatibility)
     */
    async getEntries(filter: IspQueryFilter): Promise<IspQuery[]> {
        return await this.getQueries(filter)
    }

    /**
     * Get entry by ID (for test compatibility)
     */
    async getEntryById(entryId: string, userPhone: string): Promise<IspQuery | null> {
        const result = await pool.query(
            'SELECT * FROM isp_queries WHERE id = $1 AND user_phone = $2',
            [entryId, userPhone]
        )

        if (result.rows.length === 0) {
            return null
        }

        const row = result.rows[0]
        return {
            ...row,
            api_response: JSON.parse(row.api_response),
            query_date: new Date(row.query_date),
            created_at: new Date(row.created_at)
        }
    }

    /**
     * Get totals by category (simplified for ISP queries - for test compatibility)
     */
    async getTotalsByCategory(entryType: string, userPhone: string, startDate?: string, endDate?: string): Promise<any[]> {
        // For ISP, this returns query summary grouped by query_type
        const summary = await this.getQuerySummary(userPhone, startDate, endDate)
        return summary.map(item => ({
            category: item.query_type,
            total_amount: 0, // ISP queries don't have amounts
            entry_count: item.query_count
        }))
    }

    /**
     * Get monthly summary (for test compatibility)
     */
    async getMonthlySummaryCompat(year: number, month: number, userPhone: string): Promise<any> {
        const summary = await this.getMonthlySummary(year, month, userPhone)
        return {
            total_income: 0, // Not applicable to ISP queries
            total_expenses: 0, // Not applicable to ISP queries
            net_amount: 0,
            transaction_count: summary.total_queries
        }
    }
}

export const ispRepository = new IspRepository()