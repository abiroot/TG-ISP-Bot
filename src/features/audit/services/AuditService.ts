/**
 * Audit Service (v2)
 *
 * Handles:
 * - Tool execution audit logging
 * - Analytics and metrics
 * - Performance monitoring
 * - Security event logging
 *
 * Benefits:
 * - Centralized audit trail
 * - Performance insights
 * - Security monitoring
 * - Compliance (GDPR, audit trails)
 */

import { toolExecutionAuditRepository } from '~/database/repositories/toolExecutionAuditRepository'
import { createFlowLogger } from '~/core/utils/logger'
import type { CreateToolExecutionAudit, ToolExecutionAudit } from '~/database/schemas/toolExecutionAudit'

const auditLogger = createFlowLogger('audit-service')

/**
 * Tool execution metrics
 */
export interface ToolMetrics {
    toolName: string
    totalExecutions: number
    successCount: number
    errorCount: number
    avgExecutionTimeMs: number
    lastExecutedAt: Date
}

/**
 * User activity summary
 */
export interface UserActivitySummary {
    userId: string
    totalToolCalls: number
    uniqueTools: string[]
    firstActivity: Date
    lastActivity: Date
    topTools: Array<{ toolName: string; count: number }>
}

/**
 * Analytics time range
 */
export interface TimeRange {
    startDate: Date
    endDate: Date
}

/**
 * Audit Service
 *
 * Provides audit logging, analytics, and monitoring
 */
export class AuditService {
    /**
     * Log tool execution
     */
    async logToolExecution(data: Omit<CreateToolExecutionAudit, 'id' | 'created_at'>): Promise<void> {
        try {
            await toolExecutionAuditRepository.create(data as CreateToolExecutionAudit)

            auditLogger.debug(
                {
                    toolName: data.tool_name,
                    userId: data.user_telegram_id,
                    status: data.execution_status,
                    executionTimeMs: data.duration_ms,
                },
                'Tool execution logged'
            )
        } catch (error) {
            auditLogger.error({ err: error, data }, 'Failed to log tool execution')
            // Don't throw - audit failures shouldn't break functionality
        }
    }

    /**
     * Get tool execution history
     */
    async getToolExecutionHistory(
        filters?: {
            userId?: string
            toolName?: string
            status?: 'success' | 'error' | 'timeout'
            limit?: number
            offset?: number
        }
    ): Promise<ToolExecutionAudit[]> {
        try {
            return await toolExecutionAuditRepository.query({
                user_telegram_id: filters?.userId,
                tool_name: filters?.toolName,
                execution_status: filters?.status,
                limit: filters?.limit || 100,
                offset: filters?.offset || 0,
            })
        } catch (error) {
            auditLogger.error({ err: error, filters }, 'Failed to get tool execution history')
            throw error
        }
    }

    /**
     * Get tool metrics
     */
    async getToolMetrics(toolName?: string, timeRange?: TimeRange): Promise<ToolMetrics[]> {
        try {
            const stats = await toolExecutionAuditRepository.getStats(
                toolName,
                timeRange?.startDate,
                timeRange?.endDate
            )

            // Convert stats to metrics format
            return stats.map(stat => ({
                toolName: stat.tool_name,
                totalExecutions: Number(stat.total_executions),
                successCount: Number(stat.successful_executions),
                errorCount: Number(stat.failed_executions),
                avgExecutionTimeMs: stat.avg_duration_ms || 0,
                lastExecutedAt: stat.last_execution,
            }))
        } catch (error) {
            auditLogger.error({ err: error, toolName, timeRange }, 'Failed to get tool metrics')
            throw error
        }
    }

    // Old implementation kept for reference if needed later
    private async getToolMetricsOld(toolName?: string, timeRange?: TimeRange): Promise<ToolMetrics[]> {
        try {
            const executions = await toolExecutionAuditRepository.query({
                tool_name: toolName,
                start_date: timeRange?.startDate,
                end_date: timeRange?.endDate,
            })

            // Group by tool name
            const grouped = new Map<string, ToolExecutionAudit[]>()
            executions.forEach((exec) => {
                if (!grouped.has(exec.tool_name)) {
                    grouped.set(exec.tool_name, [])
                }
                grouped.get(exec.tool_name)!.push(exec)
            })

            // Calculate metrics
            const metrics: ToolMetrics[] = []
            grouped.forEach((execs, name) => {
                const successCount = execs.filter((e) => e.execution_status === 'success').length
                const errorCount = execs.filter((e) => e.execution_status === 'error').length
                const avgExecutionTimeMs =
                    execs.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / execs.length

                const lastExecution = execs.reduce((latest, e) =>
                    new Date(e.created_at) > new Date(latest.created_at) ? e : latest
                )

                metrics.push({
                    toolName: name,
                    totalExecutions: execs.length,
                    successCount,
                    errorCount,
                    avgExecutionTimeMs,
                    lastExecutedAt: new Date(lastExecution.created_at),
                })
            })

            return metrics
        } catch (error) {
            auditLogger.error({ err: error, toolName, timeRange }, 'Failed to get tool metrics')
            throw error
        }
    }

    /**
     * Get user activity summary
     */
    async getUserActivitySummary(userId: string, timeRange?: TimeRange): Promise<UserActivitySummary> {
        try {
            const executions = await toolExecutionAuditRepository.query({
                user_telegram_id: userId,
                start_date: timeRange?.startDate,
                end_date: timeRange?.endDate,
            })

            if (executions.length === 0) {
                return {
                    userId,
                    totalToolCalls: 0,
                    uniqueTools: [],
                    firstActivity: new Date(),
                    lastActivity: new Date(),
                    topTools: [],
                }
            }

            // Calculate unique tools
            const uniqueTools: string[] = [...new Set(executions.map((e) => e.tool_name))]

            // Find first and last activity
            const sortedByDate = executions.sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
            const firstActivity = new Date(sortedByDate[0].created_at)
            const lastActivity = new Date(sortedByDate[sortedByDate.length - 1].created_at)

            // Calculate top tools
            const toolCounts = new Map<string, number>()
            executions.forEach((exec) => {
                toolCounts.set(exec.tool_name, (toolCounts.get(exec.tool_name) || 0) + 1)
            })

            const topTools = Array.from(toolCounts.entries())
                .map(([toolName, count]) => ({ toolName, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)

            return {
                userId,
                totalToolCalls: executions.length,
                uniqueTools,
                firstActivity,
                lastActivity,
                topTools,
            }
        } catch (error) {
            auditLogger.error({ err: error, userId, timeRange }, 'Failed to get user activity summary')
            throw error
        }
    }

    /**
     * Get failed tool executions (for monitoring)
     */
    async getFailedExecutions(
        limit: number = 50
    ): Promise<Array<{ toolName: string; userId: string; error: string; timestamp: Date }>> {
        try {
            const executions = await toolExecutionAuditRepository.query({
                execution_status: 'error',
                limit,
            })

            return executions.map((exec) => ({
                toolName: exec.tool_name,
                userId: exec.user_telegram_id,
                error: exec.error_message || 'Unknown error',
                timestamp: new Date(exec.created_at),
            }))
        } catch (error) {
            auditLogger.error({ err: error }, 'Failed to get failed executions')
            throw error
        }
    }

    /**
     * Get slow tool executions (performance monitoring)
     */
    async getSlowExecutions(
        thresholdMs: number = 5000,
        limit: number = 50
    ): Promise<Array<{ toolName: string; userId: string; executionTimeMs: number; timestamp: Date }>> {
        try {
            // Get recent executions
            const executions = await toolExecutionAuditRepository.query({
                limit: limit * 2, // Get more to filter
            })

            // Filter slow executions
            const slowExecutions = executions
                .filter((exec) => (exec.duration_ms || 0) > thresholdMs)
                .slice(0, limit)

            return slowExecutions.map((exec) => ({
                toolName: exec.tool_name,
                userId: exec.user_telegram_id,
                executionTimeMs: exec.duration_ms || 0,
                timestamp: new Date(exec.created_at),
            }))
        } catch (error) {
            auditLogger.error({ err: error, thresholdMs }, 'Failed to get slow executions')
            throw error
        }
    }

    /**
     * Get tool execution statistics for dashboard
     */
    async getDashboardStats(timeRange?: TimeRange): Promise<{
        totalExecutions: number
        successRate: number
        avgExecutionTimeMs: number
        topTools: Array<{ name: string; count: number }>
        activeUsers: number
        errorRate: number
    }> {
        try {
            const filters: any = {}
            if (timeRange) {
                filters.from_date = timeRange.startDate
                filters.to_date = timeRange.endDate
            }

            const executions = await toolExecutionAuditRepository.query({
                start_date: timeRange?.startDate,
                end_date: timeRange?.endDate,
                limit: 10000, // Large limit for stats
            })

            const totalExecutions = executions.length
            const successCount = executions.filter((e) => e.execution_status === 'success').length
            const errorCount = executions.filter((e) => e.execution_status === 'error').length
            const successRate = totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 0
            const errorRate = totalExecutions > 0 ? (errorCount / totalExecutions) * 100 : 0

            const avgExecutionTimeMs =
                totalExecutions > 0
                    ? executions.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / totalExecutions
                    : 0

            // Top tools
            const toolCounts = new Map<string, number>()
            executions.forEach((exec) => {
                toolCounts.set(exec.tool_name, (toolCounts.get(exec.tool_name) || 0) + 1)
            })
            const topTools = Array.from(toolCounts.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)

            // Active users
            const uniqueUsers = new Set(executions.map((e) => e.user_telegram_id))
            const activeUsers = uniqueUsers.size

            return {
                totalExecutions,
                successRate: parseFloat(successRate.toFixed(2)),
                avgExecutionTimeMs: parseFloat(avgExecutionTimeMs.toFixed(2)),
                topTools,
                activeUsers,
                errorRate: parseFloat(errorRate.toFixed(2)),
            }
        } catch (error) {
            auditLogger.error({ err: error, timeRange }, 'Failed to get dashboard stats')
            throw error
        }
    }

    /**
     * Clean up old audit logs (retention policy)
     */
    async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
        try {
            const cutoffDate = new Date()
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

            const deleted = await toolExecutionAuditRepository.deleteOlderThan(cutoffDate)

            auditLogger.info({ daysToKeep, deleted }, 'Old audit logs cleaned up')

            return deleted
        } catch (error) {
            auditLogger.error({ err: error, daysToKeep }, 'Failed to cleanup old logs')
            throw error
        }
    }
}

/**
 * Singleton instance
 */
export const auditService = new AuditService()
