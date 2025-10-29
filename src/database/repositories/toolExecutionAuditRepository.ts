/**
 * Tool Execution Audit Repository
 *
 * Data access layer for tool execution audit logs
 * Provides CRUD operations and analytics queries
 */

import { pool } from '~/config/database'
import type {
    ToolExecutionAudit,
    CreateToolExecutionAudit,
    ToolExecutionAuditQuery,
    ToolExecutionStats,
} from '~/database/schemas/toolExecutionAudit'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('tool-audit-repository')

export class ToolExecutionAuditRepository {
    /**
     * Create a new tool execution audit record
     */
    async create(data: CreateToolExecutionAudit): Promise<ToolExecutionAudit> {
        try {
            const result = await pool.query<ToolExecutionAudit>(
                `INSERT INTO tool_execution_audit (
                    tool_name, tool_call_id, context_id,
                    user_telegram_id, user_username, user_display_name,
                    input_params, output_result, execution_status,
                    error_message, started_at, completed_at, duration_ms, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *`,
                [
                    data.tool_name,
                    data.tool_call_id ?? null,
                    data.context_id,
                    data.user_telegram_id,
                    data.user_username ?? null,
                    data.user_display_name ?? null,
                    JSON.stringify(data.input_params),
                    data.output_result ? JSON.stringify(data.output_result) : null,
                    data.execution_status,
                    data.error_message ?? null,
                    data.started_at,
                    data.completed_at ?? null,
                    data.duration_ms ?? null,
                    JSON.stringify(data.metadata || {}),
                ]
            )

            return result.rows[0]
        } catch (error) {
            logger.error({ err: error, data }, 'Failed to create tool execution audit')
            throw error
        }
    }

    /**
     * Query tool execution audit logs with filters
     */
    async query(filters: ToolExecutionAuditQuery): Promise<ToolExecutionAudit[]> {
        try {
            const conditions: string[] = []
            const params: any[] = []
            let paramIndex = 1

            if (filters.user_telegram_id) {
                conditions.push(`user_telegram_id = $${paramIndex}`)
                params.push(filters.user_telegram_id)
                paramIndex++
            }

            if (filters.tool_name) {
                conditions.push(`tool_name = $${paramIndex}`)
                params.push(filters.tool_name)
                paramIndex++
            }

            if (filters.context_id) {
                conditions.push(`context_id = $${paramIndex}`)
                params.push(filters.context_id)
                paramIndex++
            }

            if (filters.execution_status) {
                conditions.push(`execution_status = $${paramIndex}`)
                params.push(filters.execution_status)
                paramIndex++
            }

            if (filters.start_date) {
                conditions.push(`created_at >= $${paramIndex}`)
                params.push(filters.start_date)
                paramIndex++
            }

            if (filters.end_date) {
                conditions.push(`created_at <= $${paramIndex}`)
                params.push(filters.end_date)
                paramIndex++
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
            const limit = filters.limit ?? 100
            const offset = filters.offset ?? 0

            const query = `
                SELECT * FROM tool_execution_audit
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `

            params.push(limit, offset)

            const result = await pool.query<ToolExecutionAudit>(query, params)
            return result.rows
        } catch (error) {
            logger.error({ err: error, filters }, 'Failed to query tool execution audit')
            throw error
        }
    }

    /**
     * Get tool execution statistics
     */
    async getStats(toolName?: string, startDate?: Date, endDate?: Date): Promise<ToolExecutionStats[]> {
        try {
            const conditions: string[] = []
            const params: any[] = []
            let paramIndex = 1

            if (toolName) {
                conditions.push(`tool_name = $${paramIndex}`)
                params.push(toolName)
                paramIndex++
            }

            if (startDate) {
                conditions.push(`created_at >= $${paramIndex}`)
                params.push(startDate)
                paramIndex++
            }

            if (endDate) {
                conditions.push(`created_at <= $${paramIndex}`)
                params.push(endDate)
                paramIndex++
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

            const query = `
                SELECT
                    tool_name,
                    COUNT(*) as total_executions,
                    SUM(CASE WHEN execution_status = 'success' THEN 1 ELSE 0 END) as successful_executions,
                    SUM(CASE WHEN execution_status = 'error' THEN 1 ELSE 0 END) as failed_executions,
                    AVG(duration_ms)::INTEGER as avg_duration_ms,
                    MAX(created_at) as last_execution
                FROM tool_execution_audit
                ${whereClause}
                GROUP BY tool_name
                ORDER BY total_executions DESC
            `

            const result = await pool.query<ToolExecutionStats>(query, params)
            return result.rows
        } catch (error) {
            logger.error({ err: error, toolName, startDate, endDate }, 'Failed to get tool execution stats')
            throw error
        }
    }

    /**
     * Get recent tool executions for a user
     */
    async getRecentByUser(userTelegramId: string, limit = 50): Promise<ToolExecutionAudit[]> {
        try {
            const result = await pool.query<ToolExecutionAudit>(
                `SELECT * FROM tool_execution_audit
                 WHERE user_telegram_id = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [userTelegramId, limit]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error, userTelegramId }, 'Failed to get recent tool executions')
            throw error
        }
    }

    /**
     * Get recent tool executions by tool name
     */
    async getRecentByTool(toolName: string, limit = 50): Promise<ToolExecutionAudit[]> {
        try {
            const result = await pool.query<ToolExecutionAudit>(
                `SELECT * FROM tool_execution_audit
                 WHERE tool_name = $1
                 ORDER BY created_at DESC
                 LIMIT $2`,
                [toolName, limit]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error, toolName }, 'Failed to get recent tool executions by tool')
            throw error
        }
    }

    /**
     * Get failed tool executions for monitoring
     */
    async getRecentFailures(limit = 50): Promise<ToolExecutionAudit[]> {
        try {
            const result = await pool.query<ToolExecutionAudit>(
                `SELECT * FROM tool_execution_audit
                 WHERE execution_status = 'error'
                 ORDER BY created_at DESC
                 LIMIT $1`,
                [limit]
            )

            return result.rows
        } catch (error) {
            logger.error({ err: error }, 'Failed to get recent failures')
            throw error
        }
    }

    /**
     * Get tool execution count for a user in a time window (rate limiting helper)
     */
    async getExecutionCountForUser(
        userTelegramId: string,
        toolName: string,
        since: Date
    ): Promise<number> {
        try {
            const result = await pool.query<{ count: string }>(
                `SELECT COUNT(*) as count FROM tool_execution_audit
                 WHERE user_telegram_id = $1
                   AND tool_name = $2
                   AND created_at >= $3`,
                [userTelegramId, toolName, since]
            )

            return parseInt(result.rows[0].count, 10)
        } catch (error) {
            logger.error({ err: error, userTelegramId, toolName }, 'Failed to get execution count')
            throw error
        }
    }

    /**
     * Delete old audit logs (for data retention policies)
     */
    async deleteOlderThan(date: Date): Promise<number> {
        try {
            const result = await pool.query(
                `DELETE FROM tool_execution_audit
                 WHERE created_at < $1`,
                [date]
            )

            logger.info({ deletedCount: result.rowCount, date }, 'Deleted old audit logs')
            return result.rowCount ?? 0
        } catch (error) {
            logger.error({ err: error, date }, 'Failed to delete old audit logs')
            throw error
        }
    }
}

// Export singleton instance
export const toolExecutionAuditRepository = new ToolExecutionAuditRepository()
