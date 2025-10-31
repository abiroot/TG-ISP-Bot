/**
 * Audit Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuditService } from '~/services/v2/AuditService'

// Mock repository
vi.mock('~/database/repositories/toolExecutionAuditRepository', () => ({
    toolExecutionAuditRepository: {
        create: vi.fn().mockResolvedValue(undefined),
        findByFilter: vi.fn().mockResolvedValue([]),
        deleteOldLogs: vi.fn().mockResolvedValue(10),
    },
}))

describe('AuditService', () => {
    let auditService: AuditService

    beforeEach(() => {
        auditService = new AuditService()
        vi.clearAllMocks()
    })

    describe('Tool Execution Logging', () => {
        it('should log tool execution', async () => {
            const logData = {
                tool_name: 'getUserInfo',
                telegram_user_id: '+1234567890',
                telegram_username: 'testuser',
                telegram_display_name: 'Test User',
                input_parameters: { identifier: '+9876543210' },
                execution_status: 'success' as const,
                execution_time_ms: 250,
                conversation_context_id: 'test-context',
            }

            await auditService.logToolExecution(logData)

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            expect(toolExecutionAuditRepository.create).toHaveBeenCalledWith(logData)
        })

        it('should not throw on logging failure', async () => {
            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.create).mockRejectedValueOnce(new Error('DB error'))

            const logData = {
                tool_name: 'test',
                telegram_user_id: 'test',
                execution_status: 'error' as const,
            }

            // Should not throw - logging failures are non-fatal
            await expect(auditService.logToolExecution(logData)).resolves.not.toThrow()
        })
    })

    describe('Tool Execution History', () => {
        it('should get tool execution history', async () => {
            const mockExecutions = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    telegram_user_id: '+1234567890',
                    execution_status: 'success',
                    execution_time_ms: 200,
                    created_at: new Date(),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockExecutions as any)

            const history = await auditService.getToolExecutionHistory({
                userId: '+1234567890',
                limit: 10,
            })

            expect(history).toHaveLength(1)
            expect(history[0].tool_name).toBe('getUserInfo')
        })

        it('should filter by tool name', async () => {
            await auditService.getToolExecutionHistory({
                toolName: 'getUserInfo',
            })

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            expect(toolExecutionAuditRepository.findByFilter).toHaveBeenCalledWith(
                expect.objectContaining({
                    tool_name: 'getUserInfo',
                })
            )
        })

        it('should filter by status', async () => {
            await auditService.getToolExecutionHistory({
                status: 'error',
            })

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            expect(toolExecutionAuditRepository.findByFilter).toHaveBeenCalledWith(
                expect.objectContaining({
                    execution_status: 'error',
                })
            )
        })
    })

    describe('Tool Metrics', () => {
        it('should calculate tool metrics', async () => {
            const mockExecutions = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    execution_status: 'success',
                    execution_time_ms: 200,
                    created_at: new Date(),
                },
                {
                    id: '2',
                    tool_name: 'getUserInfo',
                    execution_status: 'success',
                    execution_time_ms: 300,
                    created_at: new Date(),
                },
                {
                    id: '3',
                    tool_name: 'getUserInfo',
                    execution_status: 'error',
                    execution_time_ms: 100,
                    created_at: new Date(),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockExecutions as any)

            const metrics = await auditService.getToolMetrics('getUserInfo')

            expect(metrics).toHaveLength(1)
            expect(metrics[0].toolName).toBe('getUserInfo')
            expect(metrics[0].totalExecutions).toBe(3)
            expect(metrics[0].successCount).toBe(2)
            expect(metrics[0].errorCount).toBe(1)
            expect(metrics[0].avgExecutionTimeMs).toBe(200) // (200+300+100)/3
        })

        it('should group metrics by tool name', async () => {
            const mockExecutions = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    execution_status: 'success',
                    execution_time_ms: 200,
                    created_at: new Date(),
                },
                {
                    id: '2',
                    tool_name: 'checkAccountStatus',
                    execution_status: 'success',
                    execution_time_ms: 150,
                    created_at: new Date(),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockExecutions as any)

            const metrics = await auditService.getToolMetrics()

            expect(metrics).toHaveLength(2)
            expect(metrics.map((m) => m.toolName)).toContain('getUserInfo')
            expect(metrics.map((m) => m.toolName)).toContain('checkAccountStatus')
        })
    })

    describe('User Activity Summary', () => {
        it('should get user activity summary', async () => {
            const mockExecutions = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    telegram_user_id: '+1234567890',
                    execution_status: 'success',
                    created_at: new Date('2024-01-01'),
                },
                {
                    id: '2',
                    tool_name: 'checkAccountStatus',
                    telegram_user_id: '+1234567890',
                    execution_status: 'success',
                    created_at: new Date('2024-01-02'),
                },
                {
                    id: '3',
                    tool_name: 'getUserInfo',
                    telegram_user_id: '+1234567890',
                    execution_status: 'success',
                    created_at: new Date('2024-01-03'),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockExecutions as any)

            const summary = await auditService.getUserActivitySummary('+1234567890')

            expect(summary.userId).toBe('+1234567890')
            expect(summary.totalToolCalls).toBe(3)
            expect(summary.uniqueTools).toHaveLength(2)
            expect(summary.topTools[0].toolName).toBe('getUserInfo')
            expect(summary.topTools[0].count).toBe(2)
        })

        it('should handle empty activity', async () => {
            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce([])

            const summary = await auditService.getUserActivitySummary('+9999999999')

            expect(summary.totalToolCalls).toBe(0)
            expect(summary.uniqueTools).toHaveLength(0)
            expect(summary.topTools).toHaveLength(0)
        })
    })

    describe('Dashboard Statistics', () => {
        it('should get dashboard stats', async () => {
            const mockExecutions = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    telegram_user_id: 'user1',
                    execution_status: 'success',
                    execution_time_ms: 200,
                    created_at: new Date(),
                },
                {
                    id: '2',
                    tool_name: 'getUserInfo',
                    telegram_user_id: 'user2',
                    execution_status: 'error',
                    execution_time_ms: 100,
                    created_at: new Date(),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockExecutions as any)

            const stats = await auditService.getDashboardStats()

            expect(stats.totalExecutions).toBe(2)
            expect(stats.successRate).toBe(50)
            expect(stats.errorRate).toBe(50)
            expect(stats.avgExecutionTimeMs).toBe(150)
            expect(stats.activeUsers).toBe(2)
            expect(stats.topTools).toHaveLength(1)
        })
    })

    describe('Failed Executions', () => {
        it('should get failed executions', async () => {
            const mockFailures = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    telegram_user_id: 'user1',
                    execution_status: 'error',
                    error_message: 'API timeout',
                    created_at: new Date(),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockFailures as any)

            const failures = await auditService.getFailedExecutions(10)

            expect(failures).toHaveLength(1)
            expect(failures[0].error).toBe('API timeout')
        })
    })

    describe('Slow Executions', () => {
        it('should get slow executions', async () => {
            const mockExecutions = [
                {
                    id: '1',
                    tool_name: 'getUserInfo',
                    telegram_user_id: 'user1',
                    execution_time_ms: 6000, // Slow
                    created_at: new Date(),
                },
                {
                    id: '2',
                    tool_name: 'checkAccountStatus',
                    telegram_user_id: 'user2',
                    execution_time_ms: 200, // Fast
                    created_at: new Date(),
                },
            ]

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            vi.mocked(toolExecutionAuditRepository.findByFilter).mockResolvedValueOnce(mockExecutions as any)

            const slowExecutions = await auditService.getSlowExecutions(5000, 10)

            expect(slowExecutions).toHaveLength(1)
            expect(slowExecutions[0].executionTimeMs).toBe(6000)
        })
    })

    describe('Cleanup', () => {
        it('should cleanup old logs', async () => {
            const deleted = await auditService.cleanupOldLogs(90)

            expect(deleted).toBe(10)

            const { toolExecutionAuditRepository } = await import(
                '~/database/repositories/toolExecutionAuditRepository'
            )
            expect(toolExecutionAuditRepository.deleteOldLogs).toHaveBeenCalled()
        })
    })
})
