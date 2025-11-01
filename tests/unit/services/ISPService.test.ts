/**
 * ISP Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ISPService } from '~/features/isp/services/ISPService'

// Mock fetch globally
global.fetch = vi.fn()

describe('ISPService', () => {
    let ispService: ISPService

    beforeEach(() => {
        ispService = new ISPService()
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('Service Initialization', () => {
        it('should initialize with config from environment', () => {
            expect(ispService).toBeDefined()
            expect(ispService.isEnabled()).toBe(true)
        })
    })

    describe('Customer Search', () => {
        it('should search customer by phone number', async () => {
            const mockCustomerData = [
                {
                    id: 1,
                    firstName: 'John',
                    lastName: 'Doe',
                    mobile: '+1234567890',
                    userName: 'johndoe',
                    online: true,
                    activatedAccount: true,
                    blocked: false,
                    expiryAccount: '2025-12-31',
                    accountTypeName: 'Premium',
                    basicSpeedUp: 100,
                    basicSpeedDown: 100,
                    accountPrice: 50,
                    discount: 10,
                    creationDate: '2024-01-01',
                    accessPointOnline: true,
                    stationOnline: true,
                },
            ]

            // Mock authentication
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'test-token' }),
            } as Response)

            // Mock customer search
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => mockCustomerData,
            } as Response)

            const results = await ispService.searchCustomer('+1234567890')

            expect(results).toHaveLength(1)
            expect(results[0].firstName).toBe('John')
            expect(results[0].mobile).toBe('+1234567890')
        })

        it('should return empty array when customer not found', async () => {
            // Mock authentication
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'test-token' }),
            } as Response)

            // Mock 404 response
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: false,
                status: 404,
            } as Response)

            const results = await ispService.searchCustomer('+9999999999')

            expect(results).toEqual([])
        })

        it('should throw error when ISP service is disabled', async () => {
            // Temporarily disable service
            const service = new ISPService()
            // @ts-ignore - Access private property for testing
            service.config.enabled = false

            await expect(service.searchCustomer('+1234567890')).rejects.toThrow(
                'ISP service is disabled'
            )
        })
    })

    describe('Location Updates', () => {
        it('should update single user location', async () => {
            // Mock authentication
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'test-token' }),
            } as Response)

            // Mock location update
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            } as Response)

            const result = await ispService.updateUserLocation('johndoe', 33.8938, 35.5018)

            expect(result.success).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('should handle failed location update', async () => {
            // Mock authentication
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'test-token' }),
            } as Response)

            // Mock failed location update
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: false,
                text: async () => 'User not found',
            } as Response)

            const result = await ispService.updateUserLocation('nonexistent', 33.8938, 35.5018)

            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('should batch update multiple user locations', async () => {
            // Mock authentication
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'test-token' }),
            } as Response)

            // Mock successful updates
            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            } as Response)

            vi.mocked(fetch).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            } as Response)

            const updates = [
                { userName: 'user1', latitude: 33.8938, longitude: 35.5018 },
                { userName: 'user2', latitude: 33.8938, longitude: 35.5018 },
            ]

            const result = await ispService.batchUpdateLocations(updates)

            expect(result.summary.total).toBe(2)
            expect(result.summary.successful).toBeGreaterThan(0)
        })
    })

    describe('User Info Formatting', () => {
        it('should format user info with all fields', () => {
            const userInfo = {
                id: 1,
                firstName: 'John',
                lastName: 'Doe',
                mobile: '+1234567890',
                userName: 'johndoe',
                email: 'john@example.com',
                online: true,
                activatedAccount: true,
                blocked: false,
                expiryAccount: '2025-12-31',
                accountTypeName: 'Premium',
                ipAddress: '192.168.1.1',
                staticIP: '203.0.113.1',
                macAddress: '00:11:22:33:44:55',
                nasHost: 'nas01.example.com',
                mikrotikInterface: 'ether1',
                accessPointOnline: true,
                stationOnline: true,
                basicSpeedUp: 100,
                basicSpeedDown: 100,
                accountPrice: 50,
                discount: 10,
                realIpPrice: 5,
                iptvPrice: 10,
                creationDate: '2024-01-01',
                lastLogin: '2024-12-01',
                latitude: 33.8938,
                longitude: 35.5018,
            }

            const formatted = ispService.formatUserInfo(userInfo)

            expect(formatted).toContain('John Doe')
            expect(formatted).toContain('+1234567890')
            expect(formatted).toContain('192.168.1.1')
            expect(formatted).toContain('Premium')
        })
    })

    describe('Phone Number Extraction', () => {
        it('should extract phone number from message', () => {
            const phone = ispService.extractPhoneNumberFromMessage('Check +1234567890')

            expect(phone).toBe('+1234567890')
        })

        it('should extract phone number with various formats', () => {
            const formats = [
                'Check 555-123-4567',
                'Info for (555) 123-4567',
                'User 555.123.4567',
            ]

            formats.forEach((message) => {
                const phone = ispService.extractPhoneNumberFromMessage(message)
                expect(phone).toBeTruthy()
            })
        })

        it('should return null when no phone number found', () => {
            const phone = ispService.extractPhoneNumberFromMessage('Hello world')

            expect(phone).toBeNull()
        })
    })

    describe('Tool Generation', () => {
        it('should generate ISP tools for AI SDK', () => {
            const tools = ispService.getTools()

            expect(tools).toBeDefined()
            expect(tools.searchCustomer).toBeDefined()
            expect(tools.updateUserLocation).toBeDefined()
            expect(tools.batchUpdateLocations).toBeDefined()
        })

        it('should have correct tool structure', () => {
            const tools = ispService.getTools()

            expect(tools.searchCustomer.description).toBeDefined()
            expect(tools.searchCustomer.parameters).toBeDefined()
            expect(tools.searchCustomer.execute).toBeTypeOf('function')
        })
    })
})
