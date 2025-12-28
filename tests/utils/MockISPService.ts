/**
 * Mock ISP Service
 *
 * Provides realistic mock ISP API responses for testing without making real API calls
 * Implements the same interface as ISPService with AI SDK tools
 */

import { vi } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import type { ISPUserInfo, MikrotikUser } from '~/features/isp/services/ISPService'
import {
    onlineCustomer,
    offlineCustomer,
    expiredCustomer,
    mikrotikUsers,
    findCustomer,
    searchCustomers,
} from '../fixtures/ispCustomerData.js'

/**
 * Mock ISP Service with realistic responses
 */
export class MockISPService {
    // Track method calls for testing
    searchCustomerCalls: Array<{ identifier: string }> = []
    getMikrotikUsersCalls: Array<{ interfaceName: string }> = []
    updateUserLocationCalls: Array<{ userName: string; latitude: number; longitude: number }> = []
    batchUpdateLocationsCalls: Array<{ updates: Array<{ userName: string; latitude: number; longitude: number }> }> =
        []

    // Custom customers for testing
    private customCustomers: ISPUserInfo[] = []

    /**
     * Add a custom customer for testing
     */
    addCustomer(customer: Partial<ISPUserInfo>): void {
        const fullCustomer: ISPUserInfo = {
            id: this.customCustomers.length + 1000,
            userName: customer.userName || 'test',
            firstName: customer.firstName || 'Test',
            lastName: customer.lastName || 'Customer',
            mobile: customer.mobile || '00000000',
            phone: customer.phone || '00000000',
            mailAddress: customer.mailAddress || '',
            address: customer.address || '',
            comment: customer.comment || '',
            mof: customer.mof || '',
            creationDate: customer.creationDate || '',
            lastLogin: customer.lastLogin || '',
            lastLogOut: customer.lastLogOut || '',
            userCategoryId: customer.userCategoryId || 0,
            financialCategoryId: customer.financialCategoryId || 0,
            userGroupId: customer.userGroupId || 0,
            linkId: customer.linkId || 0,
            archived: customer.archived || false,
            online: customer.online !== undefined ? customer.online : true,
            active: customer.active !== undefined ? customer.active : true,
            activatedAccount: customer.activatedAccount !== undefined ? customer.activatedAccount : true,
            blocked: customer.blocked || false,
            expiryAccount: customer.expiryAccount || '',
            accountTypeName: customer.accountTypeName || 'Standard',
            userUpTime: customer.userUpTime || '',
            fupMode: customer.fupMode || '',
            ipAddress: customer.ipAddress || '',
            staticIP: customer.staticIP || '',
            macAddress: customer.macAddress || '',
            nasHost: customer.nasHost || '',
            mikrotikInterface: customer.mikrotikInterface || '',
            routerBrand: customer.routerBrand || '',
            stationOnline: customer.stationOnline || false,
            stationName: customer.stationName || '',
            stationIpAddress: customer.stationIpAddress || '',
            stationUpTime: customer.stationUpTime || '',
            stationInterfaceStats: customer.stationInterfaceStats || [],
            accessPointOnline: customer.accessPointOnline || false,
            accessPointName: customer.accessPointName || '',
            accessPointBoardName: customer.accessPointBoardName || '',
            accessPointIpAddress: customer.accessPointIpAddress || '',
            accessPointUpTime: customer.accessPointUpTime || '',
            accessPointSignal: customer.accessPointSignal || '',
            accessPointElectrical: customer.accessPointElectrical || false,
            accessPointInterfaceStats: customer.accessPointInterfaceStats || [],
            accessPointUsers: customer.accessPointUsers || [],
            basicSpeedUp: customer.basicSpeedUp || 0,
            basicSpeedDown: customer.basicSpeedDown || 0,
            dailyQuota: customer.dailyQuota || '',
            monthlyQuota: customer.monthlyQuota || '',
            accountPrice: customer.accountPrice || 0,
            discount: customer.discount || 0,
            realIpPrice: customer.realIpPrice || 0,
            iptvPrice: customer.iptvPrice || 0,
            collectorId: customer.collectorId || 0,
            collectorUserName: customer.collectorUserName || '',
            collectorFirstName: customer.collectorFirstName || '',
            collectorLastName: customer.collectorLastName || '',
            collectorMobile: customer.collectorMobile || '',
            userSessions: customer.userSessions || [],
            pingResult: customer.pingResult || null,
            latitude: customer.latitude ?? null,
            longitude: customer.longitude ?? null,
        }
        this.customCustomers.push(fullCustomer)
    }

    /**
     * Search for customer by phone or username
     * Returns array of matching customers (realistic behavior)
     */
    async searchCustomer(identifier: string): Promise<ISPUserInfo[]> {
        this.searchCustomerCalls.push({ identifier })

        // Check custom customers first
        const customMatch = this.customCustomers.find(
            (c) => c.userName === identifier || c.mobile === identifier || c.phone === identifier
        )
        if (customMatch) {
            return [customMatch]
        }

        // Simulate API behavior: exact match or partial search
        const exactMatch = findCustomer(identifier)
        if (exactMatch) {
            return [exactMatch]
        }

        // Partial search
        const results = searchCustomers(identifier)
        return results
    }

    /**
     * Get users on Mikrotik interface
     */
    async getMikrotikUsers(interfaceName: string): Promise<MikrotikUser[]> {
        this.getMikrotikUsersCalls.push({ interfaceName })

        // Return all users for test interface
        if (interfaceName === 'ether1-gateway' || interfaceName === 'test-interface') {
            return mikrotikUsers
        }

        // Empty for unknown interfaces
        return []
    }

    /**
     * Update user location
     */
    async updateUserLocation(
        userName: string,
        latitude: number,
        longitude: number
    ): Promise<{ success: boolean; error?: string }> {
        this.updateUserLocationCalls.push({ userName, latitude, longitude })

        // Check if user exists
        const user = findCustomer(userName)
        if (!user) {
            return {
                success: false,
                error: 'User not found in ISP system',
            }
        }

        // Simulate successful update
        return { success: true }
    }

    /**
     * Batch update locations
     */
    async batchUpdateLocations(
        updates: Array<{ userName: string; latitude: number; longitude: number }>
    ): Promise<{
        summary: { total: number; successful: number; failed: number }
        results: Array<{ userName: string; success: boolean; error?: string }>
    }> {
        this.batchUpdateLocationsCalls.push({ updates })

        const results: Array<{ userName: string; success: boolean; error?: string }> = []
        let successful = 0
        let failed = 0

        for (const update of updates) {
            const result = await this.updateUserLocation(update.userName, update.latitude, update.longitude)
            results.push({
                userName: update.userName,
                ...result,
            })

            if (result.success) {
                successful++
            } else {
                failed++
            }
        }

        return {
            summary: {
                total: updates.length,
                successful,
                failed,
            },
            results,
        }
    }

    /**
     * Extract phone number from message (mimics ISPService behavior)
     */
    extractPhoneNumberFromMessage(message: string, fallback?: string): string | null {
        // Clean message
        const cleanMessage = message.replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()

        // Try various phone number patterns
        const phonePatterns = [
            /\b(?:\+?\d\s?){6,15}\b/g,
            /\b(?:\+?961\s?)?\d{1,2}(?:\s?\d{2,3}){1,3}(?:\s?\d{2,3})\b/g,
            /\b(\+?\d{6,15})\b/g,
        ]

        for (const pattern of phonePatterns) {
            const matches = cleanMessage.match(pattern)
            if (matches) {
                for (const match of matches) {
                    let phoneNumber = match.replace(/[^\d+]/g, '')
                    if (phoneNumber.length >= 6 && phoneNumber.length <= 15) {
                        if (!phoneNumber.startsWith('+') && phoneNumber.length >= 10) {
                            phoneNumber = '+' + phoneNumber
                        }
                        return phoneNumber
                    }
                }
            }
        }

        // Try username pattern
        const usernamePattern = /(?:user|username|account)\s*[:-]?\s*([a-zA-Z0-9][a-zA-Z0-9_.]{2,31})/gi
        const usernameMatch = cleanMessage.match(usernamePattern)
        if (usernameMatch) {
            return usernameMatch[1]
        }

        return fallback || null
    }

    /**
     * Get AI SDK tools (for AI chat integration)
     * Returns tools that use mock data
     */
    getTools() {
        return {
            searchCustomer: tool({
                description:
                    'Search for ISP customer by phone number or username. Returns complete information including account status, technical details, and billing. Use for ANY customer-related query.',
                inputSchema: z.object({
                    identifier: z
                        .string()
                        .describe(
                            'Phone number (+1234567890, 555-1234) or username (josianeyoussef, john_doe)'
                        ),
                }),
                execute: async (args) => {
                    const results = await this.searchCustomer(args.identifier)

                    if (results.length === 0) {
                        return {
                            success: false,
                            message: `No customer found with identifier: ${args.identifier}`,
                            found: false,
                        }
                    }

                    return {
                        success: true,
                        found: true,
                        customers: results,
                        count: results.length,
                    }
                },
            }),

            getMikrotikUsers: tool({
                description:
                    'Get list of users on Mikrotik network interface with online/offline status. Useful for checking which customers are connected to a specific network segment.',
                inputSchema: z.object({
                    interfaceName: z.string().describe('Mikrotik interface name (e.g., ether1-gateway)'),
                }),
                execute: async (args) => {
                    const users = await this.getMikrotikUsers(args.interfaceName)

                    return {
                        success: true,
                        interfaceName: args.interfaceName,
                        users,
                        totalUsers: users.length,
                        onlineUsers: users.filter((u) => u.online).length,
                        offlineUsers: users.filter((u) => !u.online).length,
                    }
                },
            }),

            updateUserLocation: tool({
                description:
                    'Update GPS location (latitude/longitude) for an ISP customer. Used for tracking customer physical location or updating mapping systems.',
                inputSchema: z.object({
                    userName: z.string().describe('Customer username'),
                    latitude: z.number().describe('Latitude coordinate (e.g., 33.8938)'),
                    longitude: z.number().describe('Longitude coordinate (e.g., 35.5018)'),
                }),
                execute: async (args) => {
                    const result = await this.updateUserLocation(args.userName, args.latitude, args.longitude)

                    return {
                        success: result.success,
                        userName: args.userName,
                        location: {
                            latitude: args.latitude,
                            longitude: args.longitude,
                        },
                        error: result.error,
                    }
                },
            }),

            batchUpdateLocations: tool({
                description:
                    'Update GPS locations for multiple ISP customers at once. Useful when updating all customers in a building or area to the same location.',
                inputSchema: z.object({
                    updates: z
                        .array(
                            z.object({
                                userName: z.string(),
                                latitude: z.number(),
                                longitude: z.number(),
                            })
                        )
                        .describe('Array of customer username and location updates'),
                }),
                execute: async (args) => {
                    const result = await this.batchUpdateLocations(args.updates)

                    return {
                        success: result.summary.failed === 0,
                        summary: result.summary,
                        results: result.results,
                    }
                },
            }),
        }
    }

    /**
     * Reset all call tracking (for test cleanup)
     */
    resetCalls() {
        this.searchCustomerCalls = []
        this.getMikrotikUsersCalls = []
        this.updateUserLocationCalls = []
        this.batchUpdateLocationsCalls = []
    }
}

/**
 * Create a mock ISP service instance
 */
export function createMockISPService(): MockISPService {
    return new MockISPService()
}

/**
 * Create a Vitest-mocked ISP service (with spies)
 */
export function createVitestMockISPService() {
    const service = new MockISPService()

    return {
        searchCustomer: vi.fn(service.searchCustomer.bind(service)),
        getMikrotikUsers: vi.fn(service.getMikrotikUsers.bind(service)),
        updateUserLocation: vi.fn(service.updateUserLocation.bind(service)),
        batchUpdateLocations: vi.fn(service.batchUpdateLocations.bind(service)),
        getTools: vi.fn(service.getTools.bind(service)),
        resetCalls: vi.fn(service.resetCalls.bind(service)),
    }
}
