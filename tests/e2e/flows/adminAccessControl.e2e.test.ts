/**
 * Admin Access Control E2E Tests
 *
 * Tests centralized admin middleware protection for all admin-only commands.
 * Verifies that non-admin users are properly denied access.
 *
 * Coverage:
 * - Role management commands (/set role, /add role, /remove role, /show role, /list roles)
 * - Whitelist management (whitelist, remove, list whitelist)
 * - Bot management (bot status, maintenance, feature toggles)
 * - User listing (/users)
 *
 * Security Focus:
 * - Negative testing (non-admin access attempts)
 * - Consistent denial messages
 * - No data leakage in error messages
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { testPersonality } from '../../fixtures/personalities.js'

// Import admin flows
import { userListingFlow } from '~/features/admin/flows/UserListingFlow.js'
import {
    setRoleFlow,
    addRoleFlow,
    removeRoleFlow,
    showRoleFlow,
    listRolesFlow,
} from '~/features/admin/flows/RoleManagementFlow.js'
import { whitelistManagementFlow } from '~/features/admin/flows/WhitelistManagementFlow.js'
import { botManagementFlow } from '~/features/admin/flows/BotManagementFlow.js'

describe('Admin Access Control E2E', () => {
    let harness: FlowTestHarness

    // Test user IDs
    const ADMIN_ID = '+admin123'
    const NON_ADMIN_ID = '+user789'

    const EXPECTED_DENIAL_MESSAGE = '⚠️ This command is only available to administrators.'

    beforeEach(async () => {
        // Mock services
        const mockUserManagementService = {
            isAdmin: async (userId: string) => userId === ADMIN_ID,
            whitelistUser: async () => {},
            removeUserFromWhitelist: async () => {},
            whitelistGroup: async () => {},
            removeGroupFromWhitelist: async () => {},
            getWhitelistedUsers: async () => [],
            getWhitelistedGroups: async () => [],
        }

        const mockTelegramUserService = {
            getAllUsers: async () => [],
        }

        const mockRoleService = {
            setUserRole: async () => ({ success: true }),
            addUserRole: async () => ({ success: true }),
            removeUserRole: async () => ({ success: true }),
            getUserPermissionSummary: async () => 'Admin permissions',
            getAllRoleAssignments: async () => ({}),
            getUserRoles: async () => [],
        }

        const mockBotStateService = {
            getFullState: async () => ({
                maintenance: { enabled: false },
                features: {
                    ai_responses: true,
                    rag_enabled: true,
                    voice_transcription: true,
                    image_analysis: true,
                    isp_tools: true,
                    rate_limiting: true,
                    button_demos: false,
                    test_flows: false,
                },
            }),
            enableMaintenanceMode: async () => {},
            disableMaintenanceMode: async () => {},
            toggleFeature: async () => true,
        }

        // Create harness with admin flows and services
        harness = await createFlowTestHarness(
            [
                userListingFlow,
                setRoleFlow,
                addRoleFlow,
                removeRoleFlow,
                showRoleFlow,
                listRolesFlow,
                whitelistManagementFlow,
                botManagementFlow,
            ],
            {
                userManagementService: mockUserManagementService,
                telegramUserService: mockTelegramUserService,
                roleService: mockRoleService,
                botStateService: mockBotStateService,
            }
        )
    })

    describe('Role Management Commands - Non-Admin Access', () => {
        it('should deny non-admin access to /set role command', async () => {
            const result = await harness.sendMessage('/set role 123456789 admin', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to /add role command', async () => {
            const result = await harness.sendMessage('/add role 123456789 collector', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to /remove role command', async () => {
            const result = await harness.sendMessage('/remove role 123456789 worker', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to /show role command', async () => {
            const result = await harness.sendMessage('/show role 123456789', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to /list roles command', async () => {
            const result = await harness.sendMessage('/list roles', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })
    })

    describe('Whitelist Management Commands - Non-Admin Access', () => {
        it('should deny non-admin access to whitelist command', async () => {
            const result = await harness.sendMessage('whitelist', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to /whitelist command', async () => {
            const result = await harness.sendMessage('/whitelist', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to /remove command', async () => {
            const result = await harness.sendMessage('/remove', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to list whitelist command', async () => {
            const result = await harness.sendMessage('list whitelist', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })
    })

    describe('Bot Management Commands - Non-Admin Access', () => {
        it('should deny non-admin access to bot status command', async () => {
            const result = await harness.sendMessage('bot status', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to enable maintenance command', async () => {
            const result = await harness.sendMessage('enable maintenance', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to disable maintenance command', async () => {
            const result = await harness.sendMessage('disable maintenance', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to toggle ai command', async () => {
            const result = await harness.sendMessage('toggle ai', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to toggle voice command', async () => {
            const result = await harness.sendMessage('toggle voice', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to toggle media command', async () => {
            const result = await harness.sendMessage('toggle media', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })
    })

    describe('User Management Commands - Non-Admin Access', () => {
        it('should deny non-admin access to /users command', async () => {
            const result = await harness.sendMessage('/users', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should deny non-admin access to users command (no slash)', async () => {
            const result = await harness.sendMessage('users', NON_ADMIN_ID)

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })
    })

    describe('Admin Access - Positive Tests', () => {
        it('should allow admin to access /users command', async () => {
            const result = await harness.sendMessage('/users', ADMIN_ID)

            // Admin should get actual response, not denial message
            expect(result.responses[0]).not.toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).toContain('Telegram User Mappings')
        })

        it('should allow admin to access /list roles command', async () => {
            const result = await harness.sendMessage('/list roles', ADMIN_ID)

            // Admin should get actual response, not denial message
            expect(result.responses[0]).not.toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).toContain('Role Assignments')
        })

        it('should allow admin to access bot status command', async () => {
            const result = await harness.sendMessage('bot status', ADMIN_ID)

            // Admin should get actual response, not denial message
            expect(result.responses[0]).not.toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).toContain('Bot Status')
        })
    })

    describe('Security - No Data Leakage', () => {
        it('should not leak user data in denial messages', async () => {
            const result = await harness.sendMessage('/users', NON_ADMIN_ID)

            // Ensure no user data leaked in error message
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).not.toContain('telegram_id')
            expect(result.responses[0]).not.toContain('worker_username')
        })

        it('should not leak role data in denial messages', async () => {
            const result = await harness.sendMessage('/list roles', NON_ADMIN_ID)

            // Ensure no role data leaked in error message
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).not.toContain('admin')
            expect(result.responses[0]).not.toContain('collector')
            expect(result.responses[0]).not.toContain('worker')
        })

        it('should not leak bot state in denial messages', async () => {
            const result = await harness.sendMessage('bot status', NON_ADMIN_ID)

            // Ensure no state data leaked in error message
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
            expect(result.responses[0]).not.toContain('maintenance')
            expect(result.responses[0]).not.toContain('features')
            expect(result.responses[0]).not.toContain('uptime')
        })
    })

    describe('Edge Cases', () => {
        it('should handle empty user ID in isAdmin check gracefully', async () => {
            const result = await harness.sendMessage('/users', '')

            expect(result.responses).toHaveLength(1)
            expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
        })

        it('should handle multiple rapid admin command attempts from non-admin', async () => {
            const commands = ['/users', '/list roles', 'bot status', 'whitelist', '/set role 123 admin']

            for (const command of commands) {
                const result = await harness.sendMessage(command, NON_ADMIN_ID)
                expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
            }
        })

        it('should maintain admin check across different command variations', async () => {
            // Test command variations (with/without slash)
            const variations = [
                { command: '/set role 123 admin', expectedDenial: true },
                { command: 'set role 123 admin', expectedDenial: true },
                { command: '/add role 456 worker', expectedDenial: true },
                { command: 'add role 456 worker', expectedDenial: true },
            ]

            for (const { command, expectedDenial } of variations) {
                const result = await harness.sendMessage(command, NON_ADMIN_ID)
                if (expectedDenial) {
                    expect(result.responses[0]).toBe(EXPECTED_DENIAL_MESSAGE)
                }
            }
        })
    })
})
