/**
 * Unfulfilled Locations E2E Tests
 *
 * Tests the /unfulfilled admin command that lists location update webhook requests
 * from the last 7 days that were never fulfilled (no location record exists).
 *
 * Coverage:
 * - Admin access control (positive and negative tests)
 * - Correct identification of unfulfilled requests
 * - 7-day time window filtering
 * - Worker details display
 * - Never-updated logic (excludes outdated locations)
 *
 * Security Focus:
 * - Admin-only access (centralized middleware)
 * - No data leakage for non-admin users
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { unfulfilledLocationsFlow } from '~/features/admin/flows/UnfulfilledLocationsFlow.js'
import { messageRepository } from '~/database/repositories/messageRepository.js'

describe('Unfulfilled Locations E2E', () => {
    let harness: FlowTestHarness

    // Test user IDs
    const ADMIN_ID = '+admin123'
    const NON_ADMIN_ID = '+user789'

    const EXPECTED_DENIAL_MESSAGE = '⚠️ This command is only available to administrators.'

    // Mock unfulfilled location data
    const mockUnfulfilledRequests = [
        {
            message_id: 'msg1',
            client_username: 'josianeyoussef',
            worker_telegram_id: '123456789',
            worker_username: 'johndoe',
            worker_first_name: 'John',
            worker_last_name: 'Doe',
            worker_telegram_handle: 'johndoe',
            webhook_sent_at: new Date('2025-11-02T10:00:00Z'),
        },
        {
            message_id: 'msg2',
            client_username: 'anothercustomer',
            worker_telegram_id: '987654321',
            worker_username: 'janesmith',
            worker_first_name: 'Jane',
            worker_last_name: 'Smith',
            worker_telegram_handle: 'janesmith',
            webhook_sent_at: new Date('2025-11-01T15:30:00Z'),
        },
    ]

    beforeEach(async () => {
        // Mock userManagementService
        const mockUserManagementService = {
            isAdmin: async (userId: string) => userId === ADMIN_ID,
        }

        // Mock messageRepository.getUnfulfilledLocationRequests
        vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests').mockResolvedValue(
            mockUnfulfilledRequests
        )

        // Create harness with unfulfilled locations flow
        harness = await createFlowTestHarness([unfulfilledLocationsFlow], {
            userManagementService: mockUserManagementService,
        })
    })

    describe('Admin Access Control', () => {
        it('should deny non-admin access to /unfulfilled command', async () => {
            const result = await harness.sendMessage('/unfulfilled', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should allow admin to access /unfulfilled command', async () => {
            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)

            // Admin should get actual response, not denial message
            expect(result.responses[0]).not.toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).toContain('Unfulfilled Location Requests')
        })
    })

    describe('Unfulfilled Requests Display', () => {
        it('should display unfulfilled location requests with worker details', async () => {
            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)

            const response = result.responses[0]

            // Check header and count
            expect(response).toContain('Unfulfilled Location Requests')
            expect(response).toContain('Total Pending: 2')

            // Check first customer
            expect(response).toContain('josianeyoussef')
            expect(response).toContain('John Doe')
            expect(response).toContain('@johndoe')
            expect(response).toContain('123456789')
            expect(response).toContain('Never updated')

            // Check second customer
            expect(response).toContain('anothercustomer')
            expect(response).toContain('Jane Smith')
            expect(response).toContain('@janesmith')
            expect(response).toContain('987654321')
        })

        it('should display "no unfulfilled requests" message when list is empty', async () => {
            // Mock empty result
            vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests').mockResolvedValue([])

            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)
            const response = result.responses[0]

            expect(response).toContain('Total Pending: 0')
            expect(response).toContain('No unfulfilled location requests in the last 7 days!')
            expect(response).toContain('All webhook notifications have been processed')
        })

        it('should include related commands in footer', async () => {
            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)
            const response = result.responses[0]

            expect(response).toContain('Related Commands')
            expect(response).toContain('/users')
            expect(response).toContain('/list whitelist')
            expect(response).toContain('/bot status')
        })
    })

    describe('Repository Integration', () => {
        it('should call messageRepository with 7 days parameter', async () => {
            const spy = vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests')

            await harness.sendMessage('/unfulfilled', ADMIN_ID)

            expect(spy).toHaveBeenCalledWith(7)
        })

        it('should handle repository errors gracefully', async () => {
            // Mock repository error
            vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests').mockRejectedValue(
                new Error('Database connection failed')
            )

            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)
            const response = result.responses[0]

            expect(response).toContain('Failed to retrieve unfulfilled location requests')
        })
    })

    describe('Data Display Logic', () => {
        it('should handle missing worker telegram handle gracefully', async () => {
            const requestsWithoutHandle = [
                {
                    message_id: 'msg3',
                    client_username: 'customer3',
                    worker_telegram_id: '111222333',
                    worker_username: 'worker3',
                    worker_first_name: 'Worker',
                    worker_last_name: 'Three',
                    worker_telegram_handle: null, // No handle
                    webhook_sent_at: new Date('2025-11-02T12:00:00Z'),
                },
            ]

            vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests').mockResolvedValue(
                requestsWithoutHandle
            )

            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)
            const response = result.responses[0]

            // Should still display worker name and telegram ID
            expect(response).toContain('Worker Three')
            expect(response).toContain('111222333')
            // Should not contain @ symbol when handle is missing
            expect(response).not.toMatch(/@\s*\n/)
        })

        it('should handle missing worker name gracefully', async () => {
            const requestsWithoutName = [
                {
                    message_id: 'msg4',
                    client_username: 'customer4',
                    worker_telegram_id: '444555666',
                    worker_username: 'worker4',
                    worker_first_name: null,
                    worker_last_name: null,
                    worker_telegram_handle: 'worker4handle',
                    webhook_sent_at: new Date('2025-11-02T13:00:00Z'),
                },
            ]

            vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests').mockResolvedValue(
                requestsWithoutName
            )

            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)
            const response = result.responses[0]

            // Should still display telegram handle and ID
            expect(response).toContain('@worker4handle')
            expect(response).toContain('444555666')
        })

        it('should calculate time elapsed correctly', async () => {
            // Set a known "current time" for consistent testing
            const now = new Date('2025-11-03T12:00:00Z')
            vi.useFakeTimers()
            vi.setSystemTime(now)

            const recentRequest = [
                {
                    message_id: 'msg5',
                    client_username: 'customer5',
                    worker_telegram_id: '777888999',
                    worker_username: 'worker5',
                    worker_first_name: 'Worker',
                    worker_last_name: 'Five',
                    worker_telegram_handle: 'worker5',
                    webhook_sent_at: new Date('2025-11-03T10:30:00Z'), // 1h 30m ago
                },
            ]

            vi.spyOn(messageRepository, 'getUnfulfilledLocationRequests').mockResolvedValue(
                recentRequest
            )

            const result = await harness.sendMessage('/unfulfilled', ADMIN_ID)
            const response = result.responses[0]

            // Should show elapsed time
            expect(response).toContain('Elapsed: 1h 30m ago')

            vi.useRealTimers()
        })
    })

    describe('Security - No Data Leakage', () => {
        it('should not leak customer data in denial messages', async () => {
            const result = await harness.sendMessage('/unfulfilled', NON_ADMIN_ID)

            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).not.toContain('josianeyoussef')
            expect(result.responses[0]).not.toContain('telegram_id')
            expect(result.responses[0]).not.toContain('worker_username')
        })
    })
})
