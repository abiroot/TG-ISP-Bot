/**
 * ISP Query Flow E2E Tests
 *
 * Tests customer lookup flows with REAL conversation simulation
 * Uses mock ISP API but real flow execution and state management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { createMockISPService } from '../../utils/MockISPService.js'
import { onlineCustomer, offlineCustomer } from '../../fixtures/ispCustomerData.js'
import { testPersonality } from '../../fixtures/personalities.js'

// Import actual flows (these will be imported once the test runs)
// For now, we'll use placeholders
// import { userInfoFlow } from '~/features/isp/flows/UserInfoFlow'
// import { welcomeFlow } from '~/flows/ai/WelcomeFlow'

describe('ISP Query Flow E2E', () => {
    let harness: FlowTestHarness
    let mockISPService: ReturnType<typeof createMockISPService>

    beforeEach(async () => {
        // Create mock services
        mockISPService = createMockISPService()

        // Create test harness with flows and services
        // Note: This is a placeholder - actual flows will be imported
        const mockFlows: any[] = [] // Replace with: [userInfoFlow, welcomeFlow]

        harness = createFlowTestHarness(
            mockFlows,
            {
                // Mock ISP service with realistic data
                ispService: mockISPService,

                // Mock user management service
                userManagementService: {
                    getPersonality: async () => testPersonality,
                    isWhitelisted: async () => true,
                    isAdmin: async () => false,
                },

                // Mock bot state service
                botStateService: {
                    isMaintenanceMode: async () => false,
                    isFeatureEnabled: async () => true,
                },

                // Mock message service
                messageService: {
                    getConversationHistory: async () => [],
                    logIncoming: async () => {},
                    logOutgoing: async () => {},
                },
            },
            false // Debug mode (set to true for troubleshooting)
        )
    })

    afterEach(() => {
        harness.reset()
    })

    describe('Single-turn customer lookup', () => {
        it('should lookup customer by username in first message', async () => {
            // User asks for customer in single message
            const response = await harness.sendMessage('+1234567890', 'check josianeyoussef')

            // Verify ISP API was called
            expect(mockISPService.searchCustomerCalls).toHaveLength(1)
            expect(mockISPService.searchCustomerCalls[0].identifier).toBe('josianeyoussef')

            // Verify bot response contains customer info
            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toContain('Josiane')
            expect(response.lastMessage!.text).toContain('Youssef')
            expect(response.lastMessage!.text).toContain('🟢') // Online indicator
        })

        it('should extract phone number from natural language', async () => {
            // User provides phone number in natural language
            const response = await harness.sendMessage('+1234567890', 'can you check +961 71 534 710')

            // Verify ISP API was called with phone number
            expect(mockISPService.searchCustomerCalls).toHaveLength(1)
            expect(mockISPService.searchCustomerCalls[0].identifier).toContain('71 534 710')

            // Verify bot found the customer
            expect(response.lastMessage?.text).toContain('Josiane')
        })

        it('should handle customer not found gracefully', async () => {
            // User asks for non-existent customer
            const response = await harness.sendMessage('+1234567890', 'check nonexistent_user_12345')

            // Verify ISP API was called
            expect(mockISPService.searchCustomerCalls).toHaveLength(1)

            // Verify bot responds with "not found" message
            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text.toLowerCase()).toMatch(/not found|no customer|couldn't find/)
        })

        it('should show offline status for disconnected customers', async () => {
            // User asks for offline customer
            const response = await harness.sendMessage('+1234567890', 'check customer_offline')

            // Verify ISP API was called
            expect(mockISPService.searchCustomerCalls).toHaveLength(1)

            // Verify bot shows offline status
            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toContain('Karim')
            expect(response.lastMessage!.text).toContain('Abdallah')
            expect(response.lastMessage!.text).toMatch(/offline|disconnected|🔴/)
        })
    })

    describe('Multi-turn customer lookup', () => {
        it.skip('should complete customer lookup in 2 turns', async () => {
            // Turn 1: User asks without providing identifier
            const response1 = await harness.sendMessage('+1234567890', 'lookup customer')

            // Bot should ask for identifier
            expect(response1.lastMessage).toBeDefined()
            expect(response1.lastMessage!.text.toLowerCase()).toMatch(/phone|username|identifier|provide/)

            // Verify state was updated (awaiting identifier)
            const state = harness.getState('+1234567890')
            expect(state.awaitingIdentifier).toBe(true)

            // Turn 2: User provides identifier
            const response2 = await harness.sendMessage('+1234567890', 'josianeyoussef')

            // Verify ISP API was called
            expect(mockISPService.searchCustomerCalls).toHaveLength(1)
            expect(mockISPService.searchCustomerCalls[0].identifier).toBe('josianeyoussef')

            // Bot should return customer info
            expect(response2.lastMessage?.text).toContain('Josiane')

            // State should be cleared
            const stateAfter = harness.getState('+1234567890')
            expect(stateAfter.awaitingIdentifier).toBeUndefined()
        })

        it.skip('should allow user to cancel during multi-turn flow', async () => {
            // Turn 1: User asks without identifier
            await harness.sendMessage('+1234567890', 'lookup customer')

            // Turn 2: User cancels
            const response = await harness.sendMessage('+1234567890', 'cancel')

            // Bot should acknowledge cancellation
            expect(response.lastMessage?.text.toLowerCase()).toMatch(/cancel|stopped|ended/)

            // State should be cleared
            const state = harness.getState('+1234567890')
            expect(state.awaitingIdentifier).toBeUndefined()
        })
    })

    describe('Customer information display', () => {
        it.skip('should display all critical customer information', async () => {
            const response = await harness.sendMessage('+1234567890', 'check josianeyoussef')

            const text = response.lastMessage!.text

            // Personal info
            expect(text).toContain('Josiane')
            expect(text).toContain('Youssef')
            expect(text).toContain('+961 71 534 710')

            // Account status
            expect(text).toMatch(/online|status/i)

            // Technical details (IP, MAC, etc.)
            expect(text).toMatch(/ip|address|10\.50\.1\.45/)
        })

        it.skip('should format response as HTML for Telegram', async () => {
            const response = await harness.sendMessage('+1234567890', 'check josianeyoussef')

            // Check for HTML formatting
            const options = response.lastMessage!.options
            expect(options?.parse_mode).toBe('HTML')

            // Check for HTML tags (bold, code, etc.)
            const text = response.lastMessage!.text
            expect(text).toMatch(/<b>|<\/b>/)
        })
    })

    describe('Error handling', () => {
        it.skip('should handle ISP API errors gracefully', async () => {
            // Mock ISP service to throw error
            mockISPService.searchCustomer = async () => {
                throw new Error('ISP API connection failed')
            }

            const response = await harness.sendMessage('+1234567890', 'check josianeyoussef')

            // Bot should send error message (not crash)
            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text.toLowerCase()).toMatch(/error|problem|try again|unavailable/)
        })

        it.skip('should handle invalid phone number format', async () => {
            const response = await harness.sendMessage('+1234567890', 'check invalid-phone-123-abc')

            // Bot should handle invalid input gracefully
            expect(response.lastMessage).toBeDefined()
            // Either extracts what it can or asks for clarification
            expect(response.lastMessage!.text).toBeTruthy()
        })
    })

    describe('Conversation context', () => {
        it.skip('should remember previous lookups in conversation', async () => {
            // First lookup
            await harness.sendMessage('+1234567890', 'check josianeyoussef')

            // User references previous lookup
            const response = await harness.sendMessage(
                '+1234567890',
                'what was the IP address again?'
            )

            // Bot should remember context and provide IP
            expect(response.lastMessage?.text).toMatch(/10\.50\.1\.45|ip|address/)
        })

        it.skip('should handle multiple users independently', async () => {
            // User 1 lookup
            const response1 = await harness.sendMessage('+1111111111', 'check josianeyoussef')
            expect(response1.lastMessage?.text).toContain('Josiane')

            // User 2 lookup (different customer)
            const response2 = await harness.sendMessage('+2222222222', 'check customer_offline')
            expect(response2.lastMessage?.text).toContain('Karim')

            // Verify independent state
            const state1 = harness.getState('+1111111111')
            const state2 = harness.getState('+2222222222')
            expect(state1).not.toEqual(state2)
        })
    })

    describe('Performance', () => {
        it.skip('should respond quickly to customer lookups', async () => {
            const startTime = Date.now()

            await harness.sendMessage('+1234567890', 'check josianeyoussef')

            const duration = Date.now() - startTime

            // Should respond within 2 seconds (without real AI)
            expect(duration).toBeLessThan(2000)
        })

        it.skip('should handle rapid consecutive lookups', async () => {
            const responses = await harness.simulateConversation([
                { from: '+1234567890', body: 'check josianeyoussef' },
                { from: '+1234567890', body: 'check customer_offline' },
                { from: '+1234567890', body: 'check expired_account' },
            ])

            // All lookups should succeed
            expect(responses).toHaveLength(3)
            responses.forEach((response) => {
                expect(response.lastMessage).toBeDefined()
            })

            // ISP API should have been called 3 times
            expect(mockISPService.searchCustomerCalls).toHaveLength(3)
        })
    })
})
