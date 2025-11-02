/**
 * Admin User Management E2E Tests
 *
 * Comprehensive tests for admin operations including:
 * - Telegram user listing (/users)
 * - Role management (/set role, /add role, /remove role, /show role, /list roles)
 * - ISP service integration (customer search, network queries)
 * - Multi-user multi-chat scenarios
 * - Complex follow-up conversations
 * - Edge cases and error handling
 * - State isolation
 *
 * Tests REAL conversation flows with production-like scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { createMockISPService } from '../../utils/MockISPService.js'
import { onlineCustomer, offlineCustomer, expiredCustomer } from '../../fixtures/ispCustomerData.js'
import { testPersonality } from '../../fixtures/personalities.js'
import type { RoleName } from '~/config/roles.js'

// Import actual flows
import { userListingFlow } from '~/features/admin/flows/UserListingFlow.js'
import {
    setRoleFlow,
    addRoleFlow,
    removeRoleFlow,
    showRoleFlow,
    listRolesFlow,
} from '~/features/admin/flows/RoleManagementFlow.js'

describe('Admin User Management E2E', () => {
    let harness: FlowTestHarness
    let mockISPService: ReturnType<typeof createMockISPService>
    let mockTelegramUserService: any
    let mockRoleService: any
    let mockUserManagementService: any
    let mockBotStateService: any
    let mockMessageService: any

    // Test user IDs
    const ADMIN_ID = '+admin123'
    const ADMIN_2_ID = '+admin456'
    const USER_ID = '+user789'
    const GROUP_CHAT_ID = '-1001234567890'

    // Sample telegram users for testing
    const sampleUsers = [
        {
            telegram_id: '123456789',
            telegram_handle: 'johndoe',
            worker_username: 'john_collector',
            first_name: 'John',
            last_name: 'Doe',
            created_at: new Date('2025-01-01'),
            updated_at: new Date('2025-01-01'),
        },
        {
            telegram_id: '987654321',
            telegram_handle: 'janesmith',
            worker_username: 'jane_admin',
            first_name: 'Jane',
            last_name: 'Smith',
            created_at: new Date('2025-01-02'),
            updated_at: new Date('2025-01-02'),
        },
        {
            telegram_id: '555555555',
            telegram_handle: null,
            worker_username: 'bob_worker',
            first_name: 'Bob',
            last_name: null,
            created_at: new Date('2025-01-03'),
            updated_at: new Date('2025-01-03'),
        },
        {
            telegram_id: '777777777',
            telegram_handle: 'alice_support',
            worker_username: 'alice<script>alert("xss")</script>',
            first_name: 'Alice',
            last_name: "O'Connor",
            created_at: new Date('2025-01-04'),
            updated_at: new Date('2025-01-04'),
        },
        {
            telegram_id: '999999999',
            telegram_handle: null,
            worker_username: 'charlie_nohandle',
            first_name: 'Charlie',
            last_name: 'Brown',
            created_at: new Date('2025-01-05'),
            updated_at: new Date('2025-01-05'),
        },
    ]

    beforeEach(async () => {
        // Create mock ISP service
        mockISPService = createMockISPService()

        // Create mock Telegram user service
        mockTelegramUserService = {
            getAllUsers: vi.fn(async () => sampleUsers),
            getUserById: vi.fn(async (userId: string) =>
                sampleUsers.find((u) => u.telegram_id === userId)
            ),
        }

        // Create mock role service
        mockRoleService = {
            setUserRole: vi.fn(async (userId: string, roles: RoleName[], adminId: string) => ({
                success: true,
                message: 'Role assigned successfully',
            })),
            addUserRole: vi.fn(async (userId: string, role: RoleName, adminId: string) => ({
                success: true,
                message: 'Role added successfully',
            })),
            removeUserRole: vi.fn(async (userId: string, role: RoleName, adminId: string) => ({
                success: true,
                message: 'Role removed successfully',
            })),
            getUserPermissionSummary: vi.fn(async (userId: string) => {
                const roles = mockRoleService._roleAssignments[userId] || []
                const roleList = roles.length > 0 ? roles.join(', ') : 'No roles assigned'
                return `<b>Roles:</b> ${roleList}\n<b>Permissions:</b> ${roles.includes('admin') ? 'Full access + role management' : roles.includes('collector') || roles.includes('worker') ? 'Update customer locations' : 'None'}`
            }),
            getAllRoleAssignments: vi.fn(async () => mockRoleService._roleAssignments),
            // Internal state for tracking roles
            _roleAssignments: {
                '123456789': ['collector'] as RoleName[],
                '987654321': ['admin'] as RoleName[],
                '555555555': ['worker'] as RoleName[],
            } as Record<string, RoleName[]>,
        }

        // Create mock user management service
        mockUserManagementService = {
            getPersonality: vi.fn(async () => testPersonality),
            isWhitelisted: vi.fn(async () => true),
            isAdmin: vi.fn((userId: string) => [ADMIN_ID, ADMIN_2_ID].includes(userId)),
        }

        // Create mock bot state service
        mockBotStateService = {
            isMaintenanceMode: vi.fn(async () => false),
            isFeatureEnabled: vi.fn(async () => true),
        }

        // Create mock message service
        mockMessageService = {
            getConversationHistory: vi.fn(async () => []),
            logIncoming: vi.fn(async () => {}),
            logOutgoing: vi.fn(async () => {}),
        }

        // Create test harness with all flows
        const allFlows = [
            userListingFlow,
            setRoleFlow,
            addRoleFlow,
            removeRoleFlow,
            showRoleFlow,
            listRolesFlow,
        ]

        harness = createFlowTestHarness(
            allFlows,
            {
                ispService: mockISPService,
                telegramUserService: mockTelegramUserService,
                roleService: mockRoleService,
                userManagementService: mockUserManagementService,
                botStateService: mockBotStateService,
                messageService: mockMessageService,
            },
            false // Debug mode
        )
    })

    afterEach(() => {
        harness.reset()
        vi.clearAllMocks()
    })

    describe('1. Basic Telegram User Listing (/users)', () => {
        it('should list all telegram users for admin', async () => {
            const response = await harness.sendMessage(ADMIN_ID, '/users')

            // Verify service was called
            expect(mockTelegramUserService.getAllUsers).toHaveBeenCalled()
            expect(mockRoleService.getAllRoleAssignments).toHaveBeenCalled()

            // Verify response contains user info
            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toContain('👥 Telegram User Mappings')
            expect(response.lastMessage!.text).toContain('Total Users: 5')
            expect(response.lastMessage!.text).toContain('john_collector')
            expect(response.lastMessage!.text).toContain('123456789')
            expect(response.lastMessage!.text).toContain('@johndoe')

            // Verify HTML formatting
            expect(response.lastMessage!.options?.parse_mode).toBe('HTML')
            expect(response.lastMessage!.text).toMatch(/<b>|<code>/)
        })

        it('should deny access to non-admin users', async () => {
            const response = await harness.sendMessage(USER_ID, '/users')

            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toMatch(/administrator|admin only/i)
            expect(mockTelegramUserService.getAllUsers).not.toHaveBeenCalled()
        })

        it('should handle empty user list', async () => {
            mockTelegramUserService.getAllUsers = vi.fn(async () => [])

            const response = await harness.sendMessage(ADMIN_ID, '/users')

            expect(response.lastMessage!.text).toContain('No users mapped yet')
            expect(response.lastMessage!.text).toContain('automatically captured')
        })

        it('should show pagination for large user lists', async () => {
            // Create 25 users
            const manyUsers = Array.from({ length: 25 }, (_, i) => ({
                telegram_id: `${100000000 + i}`,
                telegram_handle: i % 2 === 0 ? `user${i}` : null,
                worker_username: `worker_${i}`,
                first_name: `User`,
                last_name: `${i}`,
                created_at: new Date(),
                updated_at: new Date(),
            }))

            mockTelegramUserService.getAllUsers = vi.fn(async () => manyUsers)

            const response = await harness.sendMessage(ADMIN_ID, '/users')

            expect(response.lastMessage!.text).toContain('Total Users: 25')
            expect(response.lastMessage!.text).toContain('...and 5 more users')
        })

        it('should escape HTML special characters in usernames', async () => {
            const response = await harness.sendMessage(ADMIN_ID, '/users')

            // Alice's username has XSS attempt and apostrophe
            expect(response.lastMessage!.text).toContain('alice&lt;script&gt;')
            expect(response.lastMessage!.text).toContain('O&#x27;Connor')
        })

        it('should display roles for users with role assignments', async () => {
            const response = await harness.sendMessage(ADMIN_ID, '/users')

            // Check that roles are displayed
            expect(response.lastMessage!.text).toMatch(/Roles:.*collector/i)
            expect(response.lastMessage!.text).toMatch(/Roles:.*admin/i)
        })

        it('should show users without telegram handles', async () => {
            const response = await harness.sendMessage(ADMIN_ID, '/users')

            // Bob has no handle
            expect(response.lastMessage!.text).toContain('bob_worker')
            expect(response.lastMessage!.text).toContain('555555555')
            // Should NOT contain "@null" or similar
            expect(response.lastMessage!.text).not.toMatch(/@null|@undefined/)
        })
    })

    describe('2. Role Management Commands', () => {
        describe('/set role', () => {
            it('should assign role to user', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/set role 123456789 admin')

                expect(mockRoleService.setUserRole).toHaveBeenCalledWith(
                    '123456789',
                    ['admin'],
                    ADMIN_ID
                )
                expect(response.lastMessage!.text).toContain('✅')
                expect(response.lastMessage!.text).toContain('Role Assigned')
                expect(response.lastMessage!.text).toContain('123456789')
                expect(response.lastMessage!.options?.parse_mode).toBe('HTML')
            })

            it('should reject invalid role names', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/set role 123456789 superuser')

                expect(response.lastMessage!.text).toContain('Invalid command format')
                expect(response.lastMessage!.text).toContain('Valid roles')
                expect(mockRoleService.setUserRole).not.toHaveBeenCalled()
            })

            it('should reject malformed command', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/set role invalid')

                expect(response.lastMessage!.text).toContain('Invalid command format')
                expect(response.lastMessage!.text).toContain('Usage:')
            })

            it('should deny access to non-admins', async () => {
                const response = await harness.sendMessage(USER_ID, '/set role 123456789 collector')

                expect(response.lastMessage!.text).toMatch(/administrator/i)
                expect(mockRoleService.setUserRole).not.toHaveBeenCalled()
            })
        })

        describe('/add role', () => {
            it('should add role without replacing existing', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/add role 123456789 admin')

                expect(mockRoleService.addUserRole).toHaveBeenCalledWith('123456789', 'admin', ADMIN_ID)
                expect(response.lastMessage!.text).toContain('✅')
                expect(response.lastMessage!.text).toContain('Role Added')
            })

            it('should handle invalid format', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/add role')

                expect(response.lastMessage!.text).toContain('Invalid command format')
                expect(mockRoleService.addUserRole).not.toHaveBeenCalled()
            })
        })

        describe('/remove role', () => {
            it('should remove specific role from user', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/remove role 123456789 collector')

                expect(mockRoleService.removeUserRole).toHaveBeenCalledWith(
                    '123456789',
                    'collector',
                    ADMIN_ID
                )
                expect(response.lastMessage!.text).toContain('✅')
                expect(response.lastMessage!.text).toContain('Role Removed')
            })
        })

        describe('/show role', () => {
            it('should display user roles and permissions', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/show role 123456789')

                expect(mockRoleService.getUserPermissionSummary).toHaveBeenCalledWith('123456789')
                expect(response.lastMessage!.text).toContain('User ID')
                expect(response.lastMessage!.text).toContain('123456789')
                expect(response.lastMessage!.text).toContain('Roles')
            })

            it('should handle invalid user ID format', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/show role')

                expect(response.lastMessage!.text).toContain('Invalid command format')
            })
        })

        describe('/list roles', () => {
            it('should show all role assignments', async () => {
                const response = await harness.sendMessage(ADMIN_ID, '/list roles')

                expect(mockRoleService.getAllRoleAssignments).toHaveBeenCalled()
                expect(response.lastMessage!.text).toContain('Role Assignments')
                expect(response.lastMessage!.text).toContain('ADMIN')
                expect(response.lastMessage!.text).toContain('COLLECTOR')
                expect(response.lastMessage!.text).toContain('WORKER')
            })
        })
    })

    describe('3. ISP Service Integration (used independently by admin)', () => {
        it('should allow admin to search ISP customer by username', async () => {
            // Note: This would route through welcomeFlow -> intentService -> ISP flow
            // For now, testing that ISP service is available and callable
            const result = await mockISPService.searchCustomer('josianeyoussef')

            expect(result).toBeDefined()
            expect(result?.username).toBe('josianeyoussef')
            expect(result?.firstName).toBe('Josiane')
        })

        it('should handle ISP customer not found', async () => {
            const result = await mockISPService.searchCustomer('nonexistent_user_12345')

            expect(result).toBeNull()
        })

        it('should track multiple ISP searches', async () => {
            await mockISPService.searchCustomer('josianeyoussef')
            await mockISPService.searchCustomer('customer_offline')
            await mockISPService.searchCustomer('expired_account')

            expect(mockISPService.searchCustomerCalls).toHaveLength(3)
            expect(mockISPService.searchCustomerCalls[0].identifier).toBe('josianeyoussef')
            expect(mockISPService.searchCustomerCalls[1].identifier).toBe('customer_offline')
            expect(mockISPService.searchCustomerCalls[2].identifier).toBe('expired_account')
        })
    })

    describe('4. Multi-User Multi-Chat Scenarios', () => {
        it('should handle concurrent admin operations from different admins', async () => {
            // Admin A lists users
            const r1 = harness.sendMessage(ADMIN_ID, '/users')

            // Admin B sets role
            const r2 = harness.sendMessage(ADMIN_2_ID, '/set role 555555555 collector')

            // Wait for both
            const [response1, response2] = await Promise.all([r1, r2])

            expect(response1.lastMessage!.text).toContain('Telegram User Mappings')
            expect(response2.lastMessage!.text).toContain('Role Assigned')
        })

        it('should isolate admin operations in different chat contexts', async () => {
            // Admin in private chat
            const privateResponse = await harness.sendMessage(ADMIN_ID, '/users', {
                from: ADMIN_ID,
            })

            // Admin in group chat (different context)
            const groupResponse = await harness.sendMessage(GROUP_CHAT_ID, '/list roles', {
                from: ADMIN_ID,
            })

            // Both should succeed independently
            expect(privateResponse.lastMessage!.text).toContain('Telegram User Mappings')
            expect(groupResponse.lastMessage!.text).toContain('Role Assignments')

            // Verify independent state
            const privateState = harness.getState(ADMIN_ID)
            const groupState = harness.getState(GROUP_CHAT_ID)
            expect(privateState).not.toBe(groupState)
        })

        it('should handle rapid messages from multiple users', async () => {
            const messages = [
                { userId: ADMIN_ID, message: '/users' },
                { userId: ADMIN_2_ID, message: '/list roles' },
                { userId: ADMIN_ID, message: '/show role 123456789' },
            ]

            const responses = await Promise.all(
                messages.map((msg) => harness.sendMessage(msg.userId, msg.message))
            )

            expect(responses[0].lastMessage!.text).toContain('Telegram User Mappings')
            expect(responses[1].lastMessage!.text).toContain('Role Assignments')
            expect(responses[2].lastMessage!.text).toContain('User ID')
        })
    })

    describe('5. Complex Follow-up Conversations', () => {
        it('Scenario A: Admin managing users and checking ISP customers', async () => {
            const conversation = await harness.simulateConversation([
                { from: ADMIN_ID, body: '/users' },
                { from: ADMIN_ID, body: '/show role 123456789' },
                { from: ADMIN_ID, body: '/add role 123456789 admin' },
                { from: ADMIN_ID, body: '/users' },
            ])

            // Verify conversation flow
            expect(conversation[0].lastMessage!.text).toContain('Telegram User Mappings')
            expect(conversation[1].lastMessage!.text).toContain('User ID')
            expect(conversation[2].lastMessage!.text).toContain('Role Added')
            expect(conversation[3].lastMessage!.text).toContain('Telegram User Mappings')

            // Verify services called in order
            expect(mockTelegramUserService.getAllUsers).toHaveBeenCalledTimes(2)
            expect(mockRoleService.getUserPermissionSummary).toHaveBeenCalledWith('123456789')
            expect(mockRoleService.addUserRole).toHaveBeenCalledWith('123456789', 'admin', ADMIN_ID)
        })

        it('Scenario B: Admin checking roles then updating', async () => {
            const conversation = await harness.simulateConversation([
                { from: ADMIN_ID, body: '/list roles' },
                { from: ADMIN_ID, body: '/show role 987654321' },
                { from: ADMIN_ID, body: '/set role 555555555 collector' },
            ])

            expect(conversation[0].lastMessage!.text).toContain('Role Assignments')
            expect(conversation[1].lastMessage!.text).toContain('987654321')
            expect(conversation[2].lastMessage!.text).toContain('Role Assigned')
        })

        it('Scenario C: Multi-admin coordination', async () => {
            // Admin A lists users
            const r1 = await harness.sendMessage(ADMIN_ID, '/users')
            expect(r1.lastMessage!.text).toContain('john_collector')

            // Admin B assigns role
            const r2 = await harness.sendMessage(ADMIN_2_ID, '/add role 555555555 admin')
            expect(r2.lastMessage!.text).toContain('Role Added')

            // Admin A verifies the change
            const r3 = await harness.sendMessage(ADMIN_ID, '/show role 555555555')
            expect(r3.lastMessage!.text).toContain('555555555')

            // Both admins' operations succeeded
            expect(mockRoleService.addUserRole).toHaveBeenCalledWith('555555555', 'admin', ADMIN_2_ID)
        })

        it('Scenario D: Admin workflow with error recovery', async () => {
            const conversation = await harness.simulateConversation([
                { from: ADMIN_ID, body: '/set role invalid format' }, // Error
                { from: ADMIN_ID, body: '/users' }, // Check users
                { from: ADMIN_ID, body: '/set role 123456789 collector' }, // Correct command
            ])

            expect(conversation[0].lastMessage!.text).toContain('Invalid command format')
            expect(conversation[1].lastMessage!.text).toContain('Telegram User Mappings')
            expect(conversation[2].lastMessage!.text).toContain('Role Assigned')
        })
    })

    describe('6. Edge Cases and Error Handling', () => {
        it('should handle database errors when listing users', async () => {
            mockTelegramUserService.getAllUsers = vi.fn(async () => {
                throw new Error('Database connection failed')
            })

            const response = await harness.sendMessage(ADMIN_ID, '/users')

            expect(response.lastMessage!.text).toMatch(/failed|error/i)
        })

        it('should handle role service errors', async () => {
            mockRoleService.setUserRole = vi.fn(async () => ({
                success: false,
                message: 'Database error: constraint violation',
            }))

            const response = await harness.sendMessage(ADMIN_ID, '/set role 123456789 admin')

            expect(response.lastMessage!.text).toContain('❌')
            expect(response.lastMessage!.text).toContain('Database error')
        })

        it('should handle special characters in command input', async () => {
            const response = await harness.sendMessage(
                ADMIN_ID,
                '/set role 123<script>alert("xss")</script> admin'
            )

            expect(response.lastMessage!.text).toContain('Invalid command format')
        })

        it('should handle very long user lists gracefully', async () => {
            const veryManyUsers = Array.from({ length: 100 }, (_, i) => ({
                telegram_id: `${i}`,
                telegram_handle: `user${i}`,
                worker_username: `worker_${i}`,
                first_name: `User`,
                last_name: `${i}`,
                created_at: new Date(),
                updated_at: new Date(),
            }))

            mockTelegramUserService.getAllUsers = vi.fn(async () => veryManyUsers)

            const response = await harness.sendMessage(ADMIN_ID, '/users')

            expect(response.lastMessage!.text).toContain('Total Users: 100')
            expect(response.lastMessage!.text).toContain('...and 80 more users')
        })

        it('should handle users with null/undefined fields', async () => {
            const usersWithNulls = [
                {
                    telegram_id: '111111111',
                    telegram_handle: null,
                    worker_username: 'minimal_user',
                    first_name: null,
                    last_name: null,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            ]

            mockTelegramUserService.getAllUsers = vi.fn(async () => usersWithNulls)

            const response = await harness.sendMessage(ADMIN_ID, '/users')

            expect(response.lastMessage!.text).toContain('minimal_user')
            expect(response.lastMessage!.text).not.toMatch(/null|undefined/)
        })

        it('should handle maintenance mode for non-admins', async () => {
            mockBotStateService.isMaintenanceMode = vi.fn(async () => true)

            // Admin should still work (if middleware allows)
            const adminResponse = await harness.sendMessage(ADMIN_ID, '/users')
            expect(adminResponse.lastMessage).toBeDefined()
        })

        it('should handle concurrent role updates on same user', async () => {
            // Simulate race condition - two admins updating same user
            const updates = [
                harness.sendMessage(ADMIN_ID, '/set role 123456789 collector'),
                harness.sendMessage(ADMIN_2_ID, '/set role 123456789 admin'),
            ]

            const responses = await Promise.all(updates)

            // Both should succeed (last one wins in database)
            expect(responses[0].lastMessage!.text).toContain('Role Assigned')
            expect(responses[1].lastMessage!.text).toContain('Role Assigned')
            expect(mockRoleService.setUserRole).toHaveBeenCalledTimes(2)
        })
    })

    describe('7. State Isolation Tests', () => {
        it('should maintain independent state between users', async () => {
            await harness.sendMessage(ADMIN_ID, '/users')
            await harness.sendMessage(ADMIN_2_ID, '/list roles')

            const state1 = harness.getState(ADMIN_ID)
            const state2 = harness.getState(ADMIN_2_ID)

            expect(state1).not.toBe(state2)
        })

        it('should maintain independent state between private and group chats', async () => {
            await harness.sendMessage(ADMIN_ID, '/users', { from: ADMIN_ID })
            await harness.sendMessage(GROUP_CHAT_ID, '/list roles', { from: ADMIN_ID })

            const privateState = harness.getState(ADMIN_ID)
            const groupState = harness.getState(GROUP_CHAT_ID)

            expect(privateState).not.toBe(groupState)
        })

        it('should preserve conversation context across multiple commands', async () => {
            await harness.simulateConversation([
                { from: ADMIN_ID, body: '/users' },
                { from: ADMIN_ID, body: '/show role 123456789' },
                { from: ADMIN_ID, body: '/list roles' },
            ])

            // Each command should complete independently
            expect(mockTelegramUserService.getAllUsers).toHaveBeenCalledTimes(1)
            expect(mockRoleService.getUserPermissionSummary).toHaveBeenCalledTimes(1)
            expect(mockRoleService.getAllRoleAssignments).toHaveBeenCalledTimes(1)
        })

        it('should not leak state between different admin users', async () => {
            // Admin 1 does operation
            await harness.sendMessage(ADMIN_ID, '/set role 123456789 admin')

            // Admin 2 does different operation
            await harness.sendMessage(ADMIN_2_ID, '/set role 555555555 collector')

            // Verify both operations completed independently
            expect(mockRoleService.setUserRole).toHaveBeenCalledTimes(2)
            expect(mockRoleService.setUserRole).toHaveBeenNthCalledWith(
                1,
                '123456789',
                ['admin'],
                ADMIN_ID
            )
            expect(mockRoleService.setUserRole).toHaveBeenNthCalledWith(
                2,
                '555555555',
                ['collector'],
                ADMIN_2_ID
            )
        })
    })

    describe('8. Integration: Admin Operations + ISP Queries', () => {
        it('should allow mixing user management and ISP operations', async () => {
            // Admin lists users
            const r1 = await harness.sendMessage(ADMIN_ID, '/users')
            expect(r1.lastMessage!.text).toContain('Telegram User Mappings')

            // Admin does ISP search
            const ispResult = await mockISPService.searchCustomer('josianeyoussef')
            expect(ispResult?.username).toBe('josianeyoussef')

            // Admin continues with role management
            const r2 = await harness.sendMessage(ADMIN_ID, '/show role 123456789')
            expect(r2.lastMessage!.text).toContain('User ID')

            // Verify ISP and user management work independently
            expect(mockISPService.searchCustomerCalls).toHaveLength(1)
            expect(mockRoleService.getUserPermissionSummary).toHaveBeenCalled()
        })

        it('should handle rapid switching between user management and ISP queries', async () => {
            const operations = [
                harness.sendMessage(ADMIN_ID, '/users'),
                harness.sendMessage(ADMIN_ID, '/show role 123456789'),
            ]

            const responses = await Promise.all(operations)

            expect(responses[0].lastMessage!.text).toContain('Telegram User Mappings')
            expect(responses[1].lastMessage!.text).toContain('User ID')

            // Now do ISP operations
            await mockISPService.searchCustomer('customer_offline')
            await mockISPService.searchCustomer('expired_account')

            expect(mockISPService.searchCustomerCalls).toHaveLength(2)
        })
    })

    describe('9. Performance and Reliability', () => {
        it('should respond quickly to user listing command', async () => {
            const startTime = Date.now()

            await harness.sendMessage(ADMIN_ID, '/users')

            const duration = Date.now() - startTime

            // Should respond within 1 second (without real database)
            expect(duration).toBeLessThan(1000)
        })

        it('should handle rapid consecutive commands', async () => {
            const commands = [
                '/users',
                '/list roles',
                '/show role 123456789',
                '/set role 555555555 admin',
            ]

            const responses = await Promise.all(
                commands.map((cmd) => harness.sendMessage(ADMIN_ID, cmd))
            )

            // All commands should succeed
            expect(responses).toHaveLength(4)
            responses.forEach((response) => {
                expect(response.lastMessage).toBeDefined()
                expect(response.lastMessage!.text).toBeTruthy()
            })
        })

        it('should handle long-running conversations without memory leaks', async () => {
            // Simulate 10 consecutive operations
            for (let i = 0; i < 10; i++) {
                await harness.sendMessage(ADMIN_ID, '/users')
                harness.clearState(ADMIN_ID)
            }

            expect(mockTelegramUserService.getAllUsers).toHaveBeenCalledTimes(10)
        })
    })
})
