/**
 * Tool Execution Audit Service
 *
 * Business logic layer for tool execution auditing
 * Provides high-level methods for logging and querying tool executions
 */

import { toolExecutionAuditRepository } from '~/database/repositories/toolExecutionAuditRepository'
import type {
    CreateToolExecutionAudit,
    ToolExecutionAuditQuery,
    ToolExecutionStats,
} from '~/database/schemas/toolExecutionAudit'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('tool-audit-service')

export class ToolExecutionAuditService {
    /**
     * Start tracking a tool execution
     * Returns a completion function to finish the audit log
     *
     * @example
     * ```ts
     * const complete = await toolAuditService.startExecution({
     *     toolName: 'getUserInfo',
     *     toolCallId: '123',
     *     contextId: 'chat_456',
     *     userTelegramId: '789',
     *     inputParams: { phoneNumber: '123456789' }
     * })
     *
     * try {
     *     const result = await ispApiService.getUserInfo(phoneNumber)
     *     await complete('success', result)
     * } catch (error) {
     *     await complete('error', null, error.message)
     * }
     * ```
     */
    async startExecution(data: {
        toolName: string
        toolCallId?: string
        contextId: string
        userTelegramId: string
        userUsername?: string
        userDisplayName?: string
        inputParams: Record<string, any>
        metadata?: Record<string, any>
    }) {
        const startedAt = new Date()

        // Return completion function
        return async (
            status: 'success' | 'error' | 'timeout',
            outputResult: Record<string, any> | null = null,
            errorMessage?: string
        ) => {
            const completedAt = new Date()
            const durationMs = completedAt.getTime() - startedAt.getTime()

            try {
                const auditData: CreateToolExecutionAudit = {
                    tool_name: data.toolName,
                    tool_call_id: data.toolCallId,
                    context_id: data.contextId,
                    user_telegram_id: data.userTelegramId,
                    user_username: data.userUsername,
                    user_display_name: data.userDisplayName,
                    input_params: data.inputParams,
                    output_result: outputResult,
                    execution_status: status,
                    error_message: errorMessage,
                    started_at: startedAt,
                    completed_at: completedAt,
                    duration_ms: durationMs,
                    metadata: data.metadata || {},
                }

                await toolExecutionAuditRepository.create(auditData)

                logger.info(
                    {
                        toolName: data.toolName,
                        status,
                        durationMs,
                        userId: data.userTelegramId,
                    },
                    'Tool execution audit logged'
                )
            } catch (error) {
                logger.error({ err: error, toolName: data.toolName }, 'Failed to log tool execution audit')
            }
        }
    }

    /**
     * Log a completed tool execution (simplified version)
     */
    async logExecution(data: CreateToolExecutionAudit): Promise<void> {
        try {
            await toolExecutionAuditRepository.create(data)
            logger.debug({ toolName: data.tool_name, status: data.execution_status }, 'Tool execution logged')
        } catch (error) {
            logger.error({ err: error, data }, 'Failed to log tool execution')
        }
    }

    /**
     * Query tool execution logs with filters
     */
    async query(filters: ToolExecutionAuditQuery) {
        return await toolExecutionAuditRepository.query(filters)
    }

    /**
     * Get tool execution statistics
     */
    async getStats(toolName?: string, startDate?: Date, endDate?: Date): Promise<ToolExecutionStats[]> {
        return await toolExecutionAuditRepository.getStats(toolName, startDate, endDate)
    }

    /**
     * Get recent tool executions for a user
     */
    async getRecentByUser(userTelegramId: string, limit = 50) {
        return await toolExecutionAuditRepository.getRecentByUser(userTelegramId, limit)
    }

    /**
     * Get recent tool executions by tool name
     */
    async getRecentByTool(toolName: string, limit = 50) {
        return await toolExecutionAuditRepository.getRecentByTool(toolName, limit)
    }

    /**
     * Get recent failed executions for monitoring
     */
    async getRecentFailures(limit = 50) {
        return await toolExecutionAuditRepository.getRecentFailures(limit)
    }

    /**
     * Check if user has exceeded tool execution rate limit
     *
     * @returns true if rate limit exceeded, false otherwise
     */
    async checkRateLimit(
        userTelegramId: string,
        toolName: string,
        maxExecutions: number,
        windowMinutes: number
    ): Promise<boolean> {
        const since = new Date(Date.now() - windowMinutes * 60 * 1000)
        const count = await toolExecutionAuditRepository.getExecutionCountForUser(
            userTelegramId,
            toolName,
            since
        )

        return count >= maxExecutions
    }

    /**
     * Get execution count for user in time window
     */
    async getExecutionCount(userTelegramId: string, toolName: string, windowMinutes: number): Promise<number> {
        const since = new Date(Date.now() - windowMinutes * 60 * 1000)
        return await toolExecutionAuditRepository.getExecutionCountForUser(userTelegramId, toolName, since)
    }

    /**
     * Clean up old audit logs (for data retention)
     *
     * @param retentionDays - Number of days to retain logs (default: 90 days)
     * @returns Number of deleted records
     */
    async cleanupOldLogs(retentionDays = 90): Promise<number> {
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
        const deletedCount = await toolExecutionAuditRepository.deleteOlderThan(cutoffDate)

        logger.info({ deletedCount, retentionDays }, 'Cleaned up old audit logs')
        return deletedCount
    }
}

// Export singleton instance
export const toolExecutionAuditService = new ToolExecutionAuditService()
