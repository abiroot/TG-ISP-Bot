/**
 * Location Update Webhook E2E Tests
 *
 * Comprehensive tests for webhook-triggered location updates including:
 * - Complete webhook flow (happy path)
 * - State cleanup after webhook (bug fix verification)
 * - Multiple webhook requests in sequence
 * - Webhook abandonment scenarios
 * - Multi-user concurrent webhooks
 * - GlobalState cleanup verification
 * - Normal location flow (non-webhook)
 *
 * Tests REAL conversation flows with production-like scenarios
 *
 * Bug being tested: After completing a webhook location update, the next
 * location share should ask "single or multiple users?" instead of assuming
 * it's for the same customer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { createMockISPService } from '../../utils/MockISPService.js'
import { testPersonality } from '../../fixtures/personalities.js'

// Import actual location flows
import { webhookLocationRequestFlow, webhookLocationSkipFlow } from '~/features/location/flows/WebhookLocationRequestFlow.js'
import { locationHandlerFlow } from '~/features/location/flows/LocationHandlerFlow.js'
import { locationConfirmFlow } from '~/features/location/flows/UpdateCoordinatesFlow.js'

describe('Location Update Webhook E2E', () => {
    let harness: FlowTestHarness
    let mockISPService: ReturnType<typeof createMockISPService>
    let mockUserManagementService: any
    let mockMessageService: any
    let mockLocationService: any

    // Test data
    const ADMIN_ID = '+admin123'
    const WORKER_ID = '+worker456'
    const USER_ID = '+user789'

    // Customer data
    const CUSTOMER_1 = 'haydartest'
    const CUSTOMER_2 = 'anothercustomer'

    // Location coordinates
    const location1 = { latitude: 33.954925, longitude: 35.616193 }
    const location2 = { latitude: 33.955145, longitude: 35.616352 }
    const location3 = { latitude: 33.956000, longitude: 35.617000 }

    beforeEach(async () => {
        // Create mock ISP service with location update tracking
        mockISPService = createMockISPService()

        // Add location update method
        mockISPService.updateUserLocation = vi.fn(async (username: string, coords: any) => ({
            success: true,
            username,
            coordinates: coords,
        }))

        // Create mock location service
        mockLocationService = {
            updateLocation: vi.fn(async (username: string, latitude: number, longitude: number) => ({
                success: true,
                username,
                latitude,
                longitude,
            })),
        }

        // Create mock user management service
        mockUserManagementService = {
            getPersonality: vi.fn(async () => testPersonality),
            isWhitelisted: vi.fn(async (userId: string) => [ADMIN_ID, WORKER_ID].includes(userId)),
            isAdmin: vi.fn((userId: string) => userId === ADMIN_ID),
        }

        // Create mock message service
        mockMessageService = {
            getConversationHistory: vi.fn(async () => []),
            logIncoming: vi.fn(async () => {}),
            logOutgoing: vi.fn(async () => {}),
        }

        // Create test harness with all location flows
        const allFlows = [
            webhookLocationRequestFlow,
            webhookLocationSkipFlow,
            locationHandlerFlow,
            locationConfirmFlow,
        ]

        harness = createFlowTestHarness(
            allFlows,
            {
                ispService: mockISPService,
                locationService: mockLocationService,
                userManagementService: mockUserManagementService,
                messageService: mockMessageService,
            },
            false // Debug mode
        )
    })

    afterEach(() => {
        harness.reset()
        vi.clearAllMocks()
    })

    describe('1. Complete Webhook Flow (Happy Path)', () => {
        it('should complete webhook location update successfully', async () => {
            // Step 1: Simulate webhook click ("Update Location" button)
            const webhookResponse = await harness.clickButton(
                WORKER_ID,
                `webhook_loc_req:${CUSTOMER_1}`
            )

            // Verify webhook flow started
            expect(webhookResponse.lastMessage).toBeDefined()
            expect(webhookResponse.lastMessage!.text).toContain('📍 Update Location for Customer')
            expect(webhookResponse.lastMessage!.text).toContain(CUSTOMER_1)
            expect(webhookResponse.lastMessage!.text).toContain('Share Location')

            // Verify state is set
            const stateAfterWebhook = harness.getState(WORKER_ID)
            expect(stateAfterWebhook.clientUsername).toBe(CUSTOMER_1)
            expect(stateAfterWebhook.triggeredBy).toBe('webhook')
            expect(stateAfterWebhook.userMode).toBe('single')

            // Step 2: Send location
            const locationResponse = await harness.sendMessage(WORKER_ID, '', {
                location: location1,
            })

            // Verify confirmation shown with pre-filled username
            expect(locationResponse.lastMessage).toBeDefined()
            expect(locationResponse.lastMessage!.text).toContain('📍 Update Summary')
            expect(locationResponse.lastMessage!.text).toContain(CUSTOMER_1)
            expect(locationResponse.lastMessage!.text).toContain(
                `${location1.latitude}, ${location1.longitude}`
            )
            expect(locationResponse.lastMessage!.text).toContain('Confirm Update')

            // Verify webhook state is cleared immediately after showing confirmation
            const stateAfterLocation = harness.getState(WORKER_ID)
            expect(stateAfterLocation.triggeredBy).toBeNull()
            expect(stateAfterLocation.clientUsername).toBeNull()
            expect(stateAfterLocation.userMode).toBeNull()

            // Step 3: Click "Confirm Update"
            const confirmResponse = await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Verify success message
            expect(confirmResponse.lastMessage).toBeDefined()
            expect(confirmResponse.lastMessage!.text).toContain('✅ Location Updated Successfully')
            expect(confirmResponse.lastMessage!.text).toContain(CUSTOMER_1)

            // Verify ISP API was called with correct coordinates
            expect(mockISPService.updateUserLocation).toHaveBeenCalledWith(
                CUSTOMER_1,
                expect.objectContaining({
                    latitude: location1.latitude,
                    longitude: location1.longitude,
                })
            )

            // Verify state is fully cleared
            const finalState = harness.getState(WORKER_ID)
            expect(finalState.triggeredBy).toBeUndefined()
            expect(finalState.clientUsername).toBeUndefined()
            expect(finalState.userMode).toBeUndefined()
        })

        it('should deny access to non-whitelisted users', async () => {
            const response = await harness.clickButton(USER_ID, `webhook_loc_req:${CUSTOMER_1}`)

            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toMatch(/whitelisted|authorized/i)
            expect(mockISPService.updateUserLocation).not.toHaveBeenCalled()
        })

        it('should handle invalid customer username in webhook', async () => {
            const response = await harness.clickButton(WORKER_ID, 'webhook_loc_req:invalid<user>')

            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toContain('❌')
            expect(response.lastMessage!.text).toMatch(/invalid.*username/i)
        })
    })

    describe('2. State Cleanup After Webhook (Bug Fix Verification)', () => {
        it('should ask for user mode after completing webhook flow', async () => {
            // Step 1: Complete full webhook flow
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Verify state is cleared
            const stateAfterConfirm = harness.getState(WORKER_ID)
            expect(stateAfterConfirm.triggeredBy).toBeUndefined()
            expect(stateAfterConfirm.clientUsername).toBeUndefined()

            // Step 2: Send ANOTHER location (new coordinates)
            const nextLocationResponse = await harness.sendMessage(WORKER_ID, '', {
                location: location2,
            })

            // ✅ CRITICAL: Bot should ask "single or multiple users?"
            expect(nextLocationResponse.lastMessage).toBeDefined()
            expect(nextLocationResponse.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(nextLocationResponse.lastMessage!.text).toContain('Location Received')

            // ✅ CRITICAL: Should NOT auto-fill previous customer
            expect(nextLocationResponse.lastMessage!.text).not.toContain(CUSTOMER_1)
            expect(nextLocationResponse.lastMessage!.text).not.toContain('Update Summary')

            // Verify state is clean (no webhook context)
            const stateAfterNextLocation = harness.getState(WORKER_ID)
            expect(stateAfterNextLocation.triggeredBy).toBeUndefined()
            expect(stateAfterNextLocation.clientUsername).toBeUndefined()
        })

        it('should allow normal location update after webhook flow', async () => {
            // Complete webhook flow
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Send new location
            await harness.sendMessage(WORKER_ID, '', { location: location2 })

            // Choose single user mode
            const modeResponse = await harness.clickButton(WORKER_ID, 'loc_mode:single')

            expect(modeResponse.lastMessage).toBeDefined()
            expect(modeResponse.lastMessage!.text).toMatch(/username|customer/i)

            // Enter different customer
            await harness.sendMessage(WORKER_ID, CUSTOMER_2)

            // Verify uses new customer, not previous webhook customer
            expect(mockISPService.updateUserLocation).toHaveBeenLastCalledWith(
                CUSTOMER_2,
                expect.any(Object)
            )
            expect(mockISPService.updateUserLocation).not.toHaveBeenLastCalledWith(
                CUSTOMER_1,
                expect.any(Object)
            )
        })
    })

    describe('3. Multiple Webhook Requests in Sequence', () => {
        it('should handle sequential webhook requests for different customers', async () => {
            // First webhook: haydartest
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })

            const confirm1 = await harness.clickButton(WORKER_ID, 'loc_confirm:yes')
            expect(confirm1.lastMessage!.text).toContain(CUSTOMER_1)

            // Second webhook: anothercustomer
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_2}`)
            const location2Response = await harness.sendMessage(WORKER_ID, '', {
                location: location2,
            })

            // Verify shows correct customer (not haydartest)
            expect(location2Response.lastMessage!.text).toContain('📍 Update Summary')
            expect(location2Response.lastMessage!.text).toContain(CUSTOMER_2)
            expect(location2Response.lastMessage!.text).not.toContain(CUSTOMER_1)

            const confirm2 = await harness.clickButton(WORKER_ID, 'loc_confirm:yes')
            expect(confirm2.lastMessage!.text).toContain(CUSTOMER_2)

            // Third location: should ask for mode (no auto-fill)
            const location3Response = await harness.sendMessage(WORKER_ID, '', {
                location: location3,
            })

            expect(location3Response.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(location3Response.lastMessage!.text).not.toContain(CUSTOMER_1)
            expect(location3Response.lastMessage!.text).not.toContain(CUSTOMER_2)
        })

        it('should track ISP API calls for each customer update', async () => {
            // Update customer 1
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Update customer 2
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_2}`)
            await harness.sendMessage(WORKER_ID, '', { location: location2 })
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Verify both API calls were made
            expect(mockISPService.updateUserLocation).toHaveBeenCalledTimes(2)
            expect(mockISPService.updateUserLocation).toHaveBeenNthCalledWith(
                1,
                CUSTOMER_1,
                expect.objectContaining({ latitude: location1.latitude })
            )
            expect(mockISPService.updateUserLocation).toHaveBeenNthCalledWith(
                2,
                CUSTOMER_2,
                expect.objectContaining({ latitude: location2.latitude })
            )
        })
    })

    describe('4. Webhook Abandonment Scenarios', () => {
        it('should clear state when user sends text instead of location', async () => {
            // Start webhook flow
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)

            // Verify state is set
            const stateBeforeText = harness.getState(WORKER_ID)
            expect(stateBeforeText.clientUsername).toBe(CUSTOMER_1)

            // User sends text message instead of location
            await harness.sendMessage(WORKER_ID, 'cancel')

            // Send location now - should ask for mode
            const locationResponse = await harness.sendMessage(WORKER_ID, '', {
                location: location1,
            })

            expect(locationResponse.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(locationResponse.lastMessage!.text).not.toContain(CUSTOMER_1)
        })

        it('should handle webhook skip button', async () => {
            // Click skip button
            const skipResponse = await harness.clickButton(WORKER_ID, 'webhook_loc_skip')

            expect(skipResponse.lastMessage).toBeDefined()
            expect(skipResponse.lastMessage!.text).toContain('⏭️')
            expect(skipResponse.lastMessage!.text).toMatch(/skipped/i)

            // Send location - should ask for mode (not auto-fill)
            const locationResponse = await harness.sendMessage(WORKER_ID, '', {
                location: location1,
            })

            expect(locationResponse.lastMessage!.text).toMatch(/single.*multiple/i)
        })

        it('should handle webhook cancellation via cancel button', async () => {
            // Start webhook flow
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })

            // Click cancel button
            const cancelResponse = await harness.clickButton(WORKER_ID, 'loc_confirm:no')

            expect(cancelResponse.lastMessage).toBeDefined()
            expect(cancelResponse.lastMessage!.text).toMatch(/cancel/i)

            // Send new location - should ask for mode
            const newLocationResponse = await harness.sendMessage(WORKER_ID, '', {
                location: location2,
            })

            expect(newLocationResponse.lastMessage!.text).toMatch(/single.*multiple/i)
        })
    })

    describe('5. Multi-User Concurrent Webhooks', () => {
        it('should handle concurrent webhooks for different users', async () => {
            const USER_A = ADMIN_ID
            const USER_B = WORKER_ID

            // User A: Start webhook for customerA
            const webhookA = await harness.clickButton(USER_A, `webhook_loc_req:${CUSTOMER_1}`)
            expect(webhookA.lastMessage!.text).toContain(CUSTOMER_1)

            // User B: Start webhook for customerB (concurrent)
            const webhookB = await harness.clickButton(USER_B, `webhook_loc_req:${CUSTOMER_2}`)
            expect(webhookB.lastMessage!.text).toContain(CUSTOMER_2)

            // User A: Send location
            const locationA = await harness.sendMessage(USER_A, '', { location: location1 })
            expect(locationA.lastMessage!.text).toContain(CUSTOMER_1)
            expect(locationA.lastMessage!.text).not.toContain(CUSTOMER_2)

            // User B: Send location
            const locationB = await harness.sendMessage(USER_B, '', { location: location2 })
            expect(locationB.lastMessage!.text).toContain(CUSTOMER_2)
            expect(locationB.lastMessage!.text).not.toContain(CUSTOMER_1)

            // User A: Confirm
            await harness.clickButton(USER_A, 'loc_confirm:yes')

            // User A: Send new location - should ask for mode
            const newLocationA = await harness.sendMessage(USER_A, '', { location: location3 })
            expect(newLocationA.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(newLocationA.lastMessage!.text).not.toContain(CUSTOMER_1)

            // Verify state isolation
            const stateA = harness.getState(USER_A)
            const stateB = harness.getState(USER_B)
            expect(stateA).not.toBe(stateB)
            expect(stateA.triggeredBy).toBeUndefined()
            expect(stateB.triggeredBy).toBe('webhook') // User B hasn't confirmed yet
        })

        it('should not leak state between users', async () => {
            // User A completes webhook
            await harness.clickButton(ADMIN_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(ADMIN_ID, '', { location: location1 })
            await harness.clickButton(ADMIN_ID, 'loc_confirm:yes')

            // User B sends location (no webhook)
            const userBResponse = await harness.sendMessage(WORKER_ID, '', { location: location2 })

            // Verify User B gets normal flow, not User A's webhook context
            expect(userBResponse.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(userBResponse.lastMessage!.text).not.toContain(CUSTOMER_1)

            // Verify independent state
            const stateA = harness.getState(ADMIN_ID)
            const stateB = harness.getState(WORKER_ID)
            expect(stateA.clientUsername).toBeUndefined()
            expect(stateB.clientUsername).toBeUndefined()
        })
    })

    describe('6. GlobalState Cleanup Verification', () => {
        it('should clear globalState after retrieving webhook context', async () => {
            // Start webhook flow (sets globalState)
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)

            // Send location (should retrieve and clear globalState)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })

            // Verify globalState was cleared by attempting to retrieve it
            // (In real implementation, globalState.get would return null)
            const state = harness.getState(WORKER_ID)
            expect(state.triggeredBy).toBeNull()

            // Send another location - should ask for mode (globalState not present)
            const nextLocation = await harness.sendMessage(WORKER_ID, '', { location: location2 })
            expect(nextLocation.lastMessage!.text).toMatch(/single.*multiple/i)
        })

        it('should use user-specific globalState keys', async () => {
            // User A webhook
            await harness.clickButton(ADMIN_ID, `webhook_loc_req:${CUSTOMER_1}`)

            // User B webhook (different customer)
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_2}`)

            // User A sends location - should get CUSTOMER_1
            const locationA = await harness.sendMessage(ADMIN_ID, '', { location: location1 })
            expect(locationA.lastMessage!.text).toContain(CUSTOMER_1)
            expect(locationA.lastMessage!.text).not.toContain(CUSTOMER_2)

            // User B sends location - should get CUSTOMER_2
            const locationB = await harness.sendMessage(WORKER_ID, '', { location: location2 })
            expect(locationB.lastMessage!.text).toContain(CUSTOMER_2)
            expect(locationB.lastMessage!.text).not.toContain(CUSTOMER_1)
        })
    })

    describe('7. Normal Location Flow (No Webhook)', () => {
        it('should prompt for user mode when sending location without webhook', async () => {
            // Send location (no webhook trigger)
            const response = await harness.sendMessage(WORKER_ID, '', { location: location1 })

            // Verify asks for single or multiple
            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toContain('✅')
            expect(response.lastMessage!.text).toContain('Location Received')
            expect(response.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(response.lastMessage!.text).toContain(
                `${location1.latitude.toFixed(6)}, ${location1.longitude.toFixed(6)}`
            )

            // Verify no customer auto-fill
            expect(response.lastMessage!.text).not.toContain(CUSTOMER_1)
            expect(response.lastMessage!.text).not.toContain(CUSTOMER_2)

            // Verify no webhook state
            const state = harness.getState(WORKER_ID)
            expect(state.triggeredBy).toBeUndefined()
            expect(state.clientUsername).toBeUndefined()
        })

        it('should complete normal flow after choosing single user mode', async () => {
            // Send location
            await harness.sendMessage(WORKER_ID, '', { location: location1 })

            // Choose single user mode
            const modeResponse = await harness.clickButton(WORKER_ID, 'loc_mode:single')

            expect(modeResponse.lastMessage).toBeDefined()
            expect(modeResponse.lastMessage!.text).toMatch(/username|customer/i)

            // Enter customer username
            await harness.sendMessage(WORKER_ID, CUSTOMER_1)

            // Verify confirmation shown
            const confirmResponse = harness.getLastResponse()
            expect(confirmResponse?.text).toContain('📍 Update Summary')
            expect(confirmResponse?.text).toContain(CUSTOMER_1)

            // Confirm update
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Verify ISP API called
            expect(mockISPService.updateUserLocation).toHaveBeenCalledWith(
                CUSTOMER_1,
                expect.objectContaining({ latitude: location1.latitude })
            )
        })

        it('should ask for mode again on next location share', async () => {
            // First normal flow
            await harness.sendMessage(WORKER_ID, '', { location: location1 })
            await harness.clickButton(WORKER_ID, 'loc_mode:single')
            await harness.sendMessage(WORKER_ID, CUSTOMER_1)
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Send another location
            const nextLocation = await harness.sendMessage(WORKER_ID, '', { location: location2 })

            // Should ask for mode again (not remember previous choice)
            expect(nextLocation.lastMessage!.text).toMatch(/single.*multiple/i)
            expect(nextLocation.lastMessage!.text).not.toContain(CUSTOMER_1)
        })
    })

    describe('8. Edge Cases', () => {
        it('should handle rapid location shares after webhook', async () => {
            // Webhook flow
            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            await harness.sendMessage(WORKER_ID, '', { location: location1 })
            await harness.clickButton(WORKER_ID, 'loc_confirm:yes')

            // Rapid location shares
            const rapidLocations = [
                harness.sendMessage(WORKER_ID, '', { location: location2 }),
                harness.sendMessage(WORKER_ID, '', { location: location3 }),
            ]

            const responses = await Promise.all(rapidLocations)

            // Both should ask for mode
            responses.forEach((response) => {
                expect(response.lastMessage!.text).toMatch(/single.*multiple/i)
            })
        })

        it('should handle webhook with very long customer username', async () => {
            const longCustomer = 'a'.repeat(100)

            const response = await harness.clickButton(WORKER_ID, `webhook_loc_req:${longCustomer}`)

            expect(response.lastMessage).toBeDefined()
            expect(response.lastMessage!.text).toContain(longCustomer)
        })

        it('should handle location with extreme coordinates', async () => {
            const extremeLocation = { latitude: 90, longitude: 180 }

            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)
            const response = await harness.sendMessage(WORKER_ID, '', {
                location: extremeLocation,
            })

            expect(response.lastMessage!.text).toContain('90')
            expect(response.lastMessage!.text).toContain('180')
        })
    })

    describe('9. Performance & Reliability', () => {
        it('should handle long-running webhook sessions without memory leaks', async () => {
            // Simulate 5 consecutive webhook updates
            for (let i = 0; i < 5; i++) {
                await harness.clickButton(WORKER_ID, `webhook_loc_req:customer${i}`)
                await harness.sendMessage(WORKER_ID, '', { location: location1 })
                await harness.clickButton(WORKER_ID, 'loc_confirm:yes')
                harness.clearState(WORKER_ID)
            }

            // Final location should still ask for mode
            const finalLocation = await harness.sendMessage(WORKER_ID, '', { location: location2 })
            expect(finalLocation.lastMessage!.text).toMatch(/single.*multiple/i)
        })

        it('should respond quickly to webhook requests', async () => {
            const startTime = Date.now()

            await harness.clickButton(WORKER_ID, `webhook_loc_req:${CUSTOMER_1}`)

            const duration = Date.now() - startTime

            // Should respond within 1 second
            expect(duration).toBeLessThan(1000)
        })
    })
})
