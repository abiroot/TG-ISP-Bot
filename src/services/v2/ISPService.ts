/**
 * ISP Service (v2)
 *
 * Consolidated ISP service that merges:
 * - ispApiService.ts
 * - ispToolsService.ts (654 lines with 7 tools)
 *
 * Consolidates 7 tools → 3 focused tools:
 * 1. searchCustomer (replaces getUserInfo, checkAccountStatus, getTechnicalDetails, getBillingInfo, getMikrotikUserList)
 * 2. updateUserLocation (single user)
 * 3. batchUpdateLocations (multiple users)
 *
 * Benefits:
 * - Simpler tool selection for AI
 * - Less redundant API calls
 * - Better code reuse
 * - Cleaner abstractions
 */

import { tool } from 'ai'
import { z } from 'zod'
import { env } from '~/config/env'
import { createFlowLogger } from '~/utils/logger'
import { html } from '~/utils/telegramFormatting'
import type { Personality } from '~/database/schemas/personality'

const ispLogger = createFlowLogger('isp-service')

/**
 * ISP Service Error with structured error codes
 */
export class ISPServiceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: unknown,
        public readonly retryable: boolean = false
    ) {
        super(message)
        this.name = 'ISPServiceError'
    }
}

/**
 * ISP User Information (complete - matches API response)
 */
export interface ISPUserInfo {
    // Personal info
    id: number
    userName: string
    firstName: string
    lastName: string
    mobile: string
    phone: string
    mailAddress: string
    address: string
    comment: string
    mof: string

    // Account info
    creationDate: string | null
    lastLogin: string | null
    lastLogOut: string | null
    userCategoryId: number
    financialCategoryId: number
    userGroupId: number
    linkId: number
    archived: boolean

    // Account status
    online: boolean
    active: boolean
    activatedAccount: boolean
    blocked: boolean
    expiryAccount: string
    accountTypeName: string
    userUpTime: string
    fupMode: string

    // Technical details
    ipAddress: string
    staticIP: string
    macAddress: string
    nasHost: string
    mikrotikInterface: string
    routerBrand: string

    // Station info
    stationOnline: boolean
    stationName: string
    stationIpAddress: string
    stationUpTime: string
    stationInterfaceStats: any[] | null

    // Access point info
    accessPointOnline: boolean
    accessPointName: string
    accessPointIpAddress: string
    accessPointUpTime: string
    accessPointSignal: string
    accessPointElectrical: boolean
    accessPointInterfaceStats: any[] | null
    accessPointUsers: Array<{
        userName: string
        online: boolean
    }>

    // Network speeds & quotas
    basicSpeedUp: number
    basicSpeedDown: number
    dailyQuota: string
    monthlyQuota: string

    // Billing
    accountPrice: number
    discount: number
    realIpPrice: number
    iptvPrice: number

    // Collector info
    collectorId: number
    collectorUserName: string
    collectorFirstName: string
    collectorLastName: string
    collectorMobile: string

    // Session history
    userSessions: Array<{
        startSession: string
        endSession: string | null
        sessionTime: string | null
    }>

    // Ping results
    pingResult: string[]
}

/**
 * ISP API credentials and configuration
 */
interface ISPConfig {
    baseUrl: string
    username: string
    password: string
    enabled: boolean
}

/**
 * Tool execution context (passed via AI SDK experimental_context)
 */
export interface ToolExecutionContext {
    userPhone: string
    contextId: string
    userName?: string
    personality: Personality
    userMessage: string
}

/**
 * ISP Service
 *
 * Handles all ISP management system integration:
 * - Customer information lookup
 * - Account status checking
 * - Technical details retrieval
 * - Location updates (single and batch)
 */
export class ISPService {
    private config: ISPConfig
    private authToken?: string
    private tokenExpiry?: Date

    constructor() {
        this.config = {
            baseUrl: env.ISP_API_BASE_URL,
            username: env.ISP_API_USERNAME,
            password: env.ISP_API_PASSWORD,
            enabled: env.ISP_ENABLED ?? true,
        }

        ispLogger.info(
            { enabled: this.config.enabled, baseUrl: this.config.baseUrl },
            'ISPService initialized'
        )
    }

    /**
     * Authenticate with ISP API and get token
     */
    private async authenticate(): Promise<string> {
        // Check if token is still valid
        if (this.authToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
            return this.authToken
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/authenticate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userName: this.config.username,
                    password: this.config.password,
                }),
            })

            if (!response.ok) {
                throw new ISPServiceError(
                    `Authentication failed: ${response.statusText}`,
                    'AUTH_FAILED',
                    undefined,
                    response.status >= 500 // Retry on server errors
                )
            }

            // API returns raw JWT token (not JSON)
            const token = await response.text()
            this.authToken = token.trim()
            this.tokenExpiry = new Date(Date.now() + 3600000) // 1 hour

            ispLogger.info('ISP API authentication successful')
            return this.authToken
        } catch (error) {
            if (error instanceof ISPServiceError) {
                throw error
            }

            ispLogger.error({ err: error }, 'ISP API authentication failed')
            throw new ISPServiceError(
                'Authentication failed with network error',
                'AUTH_NETWORK_ERROR',
                error,
                true // Network errors are retryable
            )
        }
    }

    /**
     * Search for customer by phone number or username
     * Consolidates: getUserInfo, checkAccountStatus, getTechnicalDetails, getBillingInfo
     */
    async searchCustomer(identifier: string): Promise<ISPUserInfo[]> {
        if (!this.config.enabled) {
            throw new ISPServiceError(
                'ISP service is disabled in configuration',
                'SERVICE_DISABLED',
                undefined,
                false
            )
        }

        try {
            const token = await this.authenticate()

            const response = await fetch(
                `${this.config.baseUrl}/user-info?mobile=${encodeURIComponent(identifier)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!response.ok) {
                if (response.status === 404) {
                    // Not found is not an error - return empty array
                    return []
                }

                throw new ISPServiceError(
                    `Customer search failed: ${response.statusText}`,
                    'SEARCH_FAILED',
                    undefined,
                    response.status >= 500 // Retry on server errors
                )
            }

            const data = await response.json()
            const users = Array.isArray(data) ? data : [data]

            ispLogger.info(
                { identifier, usersFound: users.length },
                'Customer search completed'
            )

            return users
        } catch (error) {
            if (error instanceof ISPServiceError) {
                throw error
            }

            ispLogger.error({ err: error, identifier }, 'Customer search failed')
            throw new ISPServiceError(
                'Customer search failed with network error',
                'SEARCH_NETWORK_ERROR',
                error,
                true // Network errors are retryable
            )
        }
    }

    /**
     * Update location for a single user
     */
    async updateUserLocation(
        userName: string,
        latitude: number,
        longitude: number
    ): Promise<{ success: boolean; error?: string }> {
        if (!this.config.enabled) {
            throw new ISPServiceError(
                'ISP service is disabled in configuration',
                'SERVICE_DISABLED',
                undefined,
                false
            )
        }

        try {
            const token = await this.authenticate()

            const response = await fetch(`${this.config.baseUrl}/customers/${userName}/location`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ latitude, longitude }),
            })

            if (!response.ok) {
                const error = await response.text()
                ispLogger.warn(
                    { userName, latitude, longitude, error },
                    'Location update failed'
                )
                return { success: false, error }
            }

            ispLogger.info({ userName, latitude, longitude }, 'User location updated')
            return { success: true }
        } catch (error) {
            if (error instanceof ISPServiceError) {
                throw error
            }

            ispLogger.error({ err: error, userName }, 'Location update failed with network error')
            throw new ISPServiceError(
                'Location update failed with network error',
                'LOCATION_UPDATE_NETWORK_ERROR',
                error,
                true // Network errors are retryable
            )
        }
    }

    /**
     * Update location for multiple users (batch)
     */
    async batchUpdateLocations(
        updates: Array<{ userName: string; latitude: number; longitude: number }>
    ): Promise<{
        summary: { total: number; successful: number; failed: number }
        results: Array<{ userName: string; success: boolean; error?: string }>
    }> {
        if (!this.config.enabled) {
            throw new ISPServiceError(
                'ISP service is disabled in configuration',
                'SERVICE_DISABLED',
                undefined,
                false
            )
        }

        const results: Array<{ userName: string; success: boolean; error?: string }> = []

        for (const update of updates) {
            try {
                const result = await this.updateUserLocation(
                    update.userName,
                    update.latitude,
                    update.longitude
                )
                results.push({
                    userName: update.userName,
                    ...result,
                })
            } catch (error) {
                // Catch ISPServiceError and convert to result format
                if (error instanceof ISPServiceError) {
                    results.push({
                        userName: update.userName,
                        success: false,
                        error: `${error.code}: ${error.message}`,
                    })
                } else {
                    results.push({
                        userName: update.userName,
                        success: false,
                        error: 'Unknown error occurred',
                    })
                }
            }
        }

        const summary = {
            total: results.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
        }

        ispLogger.info(summary, 'Batch location update completed')
        return { summary, results }
    }

    /**
     * Format user info for display
     */
    formatUserInfo(userInfo: ISPUserInfo): string {
        const statusEmoji = userInfo.online ? '🟢' : '🔴'
        const accountStatus = userInfo.activatedAccount ? '✅ Active' : '❌ Inactive'
        const blockedStatus = userInfo.blocked ? '🚫 Blocked' : '✅ Allowed'
        const archivedStatus = userInfo.archived ? '📦 Archived' : ''

        const expiryDate = new Date(userInfo.expiryAccount)
        const isExpired = expiryDate < new Date()
        const expiryStatus = isExpired ? '⏰ Expired' : '✅ Valid'

        // Format dates
        const formatDate = (dateStr: string | null) => {
            if (!dateStr) return 'N/A'
            return new Date(dateStr).toLocaleString()
        }

        // Escape helper - only escape raw user data
        const esc = (str: string | null | undefined, fallback = 'N/A') => {
            return html.escape(str || fallback)
        }

        // Recent sessions (last 3)
        const recentSessions = userInfo.userSessions
            .slice(0, 3)
            .map((session) => {
                const start = new Date(session.startSession).toLocaleString()
                const end = session.endSession ? new Date(session.endSession).toLocaleString() : 'Active'
                return `• ${esc(start)} → ${esc(end)}\n  Duration: ${esc(session.sessionTime, 'Ongoing')}`
            })
            .join('\n')

        // Access point users
        const apUsers = userInfo.accessPointUsers
            .map((u) => `• ${esc(u.userName)} ${u.online ? '🟢' : '🔴'}`)
            .join('\n')

        return `
Here is the information for user <b>${esc(userInfo.firstName)} ${esc(userInfo.lastName)}</b>:

👤 <b>User Details:</b>
- <b>ID:</b> <code>${userInfo.id}</code>
- <b>Username:</b> <code>${esc(userInfo.userName)}</code>
- <b>Mobile:</b> ${esc(userInfo.mobile)}
- <b>Phone:</b> ${esc(userInfo.phone)}
- <b>Address:</b> ${esc(userInfo.address)}

📊 <b>Account Status:</b>
- <b>Online:</b> ${statusEmoji} ${userInfo.online ? `Online (${esc(userInfo.userUpTime)})` : 'Offline'}
- <b>Account:</b> ${accountStatus}
- <b>Access:</b> ${blockedStatus}
- <b>Validity:</b> ${expiryStatus}
- <b>Type:</b> ${esc(userInfo.accountTypeName)}
- <b>FUP Mode:</b> ${esc(userInfo.fupMode)}

🌐 <b>Network Details:</b>
- <b>IP Address:</b> <code>${esc(userInfo.ipAddress, 'Not assigned')}</code>
- <b>Static IP:</b> ${esc(userInfo.staticIP, 'None')}
- <b>MAC Address:</b> <code>${esc(userInfo.macAddress, 'Not registered')}</code>
- <b>NAS Host:</b> <code>${esc(userInfo.nasHost, 'Not connected')}</code>
- <b>Router Brand:</b> ${esc(userInfo.routerBrand, 'Unknown')}
- <b>Speeds:</b> ↑${userInfo.basicSpeedUp} Mbps / ↓${userInfo.basicSpeedDown} Mbps

📡 <b>Station Information:</b>
- <b>Status:</b> ${userInfo.stationOnline ? '🟢 Online' : '🔴 Offline'}
- <b>Name:</b> ${esc(userInfo.stationName)}
- <b>IP:</b> <code>${esc(userInfo.stationIpAddress)}</code>
- <b>Uptime:</b> ${esc(userInfo.stationUpTime)}

📶 <b>Access Point:</b>
- <b>Status:</b> ${userInfo.accessPointOnline ? '🟢 Online' : '🔴 Offline'}
- <b>Name:</b> ${esc(userInfo.accessPointName)}
- <b>IP:</b> <code>${esc(userInfo.accessPointIpAddress)}</code>
- <b>Uptime:</b> ${esc(userInfo.accessPointUpTime)}
- <b>Signal:</b> ${esc(userInfo.accessPointSignal)}

👥 <b>Users on Same AP:</b>
${apUsers || '• None'}

💰 <b>Billing Information:</b>
- <b>Account Price:</b> $${userInfo.accountPrice}
- <b>Discount:</b> ${userInfo.discount}%
- <b>Expires:</b> ${expiryDate.toLocaleDateString()}

📅 <b>Timeline:</b>
- <b>Last Login:</b> ${esc(formatDate(userInfo.lastLogin))}
- <b>Last Logout:</b> ${esc(formatDate(userInfo.lastLogOut))}

🕐 <b>Recent Sessions:</b>
${recentSessions || '• No recent sessions'}

If you need further assistance, feel free to ask! 😊`.trim()
    }

    /**
     * Extract phone number from message
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
        const usernamePattern = /(?:user|username|account)\s*[:-]?\s*([a-zA-Z][a-zA-Z0-9_.]{2,31})/gi
        const usernameMatch = cleanMessage.match(usernamePattern)
        if (usernameMatch) {
            return usernameMatch[1]
        }

        return fallback || null
    }

    /**
     * Get ISP tools for AI SDK v5
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
                    ispLogger.info(
                        { identifier: args.identifier },
                        'searchCustomer tool called'
                    )

                    const users = await this.searchCustomer(args.identifier)

                    if (users.length === 0) {
                        return {
                            success: false,
                            message: `❌ Customer not found: ${args.identifier}`,
                            found: false,
                        }
                    }

                    // Return first user formatted
                    const userInfo = users[0]
                    return {
                        success: true,
                        message: this.formatUserInfo(userInfo),
                        found: true,
                        user: userInfo,
                    }
                },
            }),

            updateUserLocation: tool({
                description:
                    'Update location coordinates for a single ISP user. Use when user wants to update one person\'s location.',
                inputSchema: z.object({
                    userName: z.string().describe('Username to update location for'),
                    latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
                    longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
                }),
                execute: async (args) => {
                    ispLogger.info(
                        {
                            userName: args.userName,
                            latitude: args.latitude,
                            longitude: args.longitude,
                        },
                        'updateUserLocation tool called'
                    )

                    const result = await this.updateUserLocation(
                        args.userName,
                        args.latitude,
                        args.longitude
                    )

                    if (result.success) {
                        return {
                            success: true,
                            message: `✅ Location updated for ${args.userName}\n📍 ${args.latitude}, ${args.longitude}`,
                        }
                    } else {
                        return {
                            success: false,
                            message: `❌ Failed to update location for ${args.userName}\n${result.error}`,
                        }
                    }
                },
            }),

            batchUpdateLocations: tool({
                description:
                    'Update location for multiple ISP users at once. Use when user wants to update several users to the same location.',
                inputSchema: z.object({
                    userNames: z.array(z.string()).describe('Array of usernames to update'),
                    latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
                    longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
                }),
                execute: async (args) => {
                    ispLogger.info(
                        {
                            userCount: args.userNames.length,
                            latitude: args.latitude,
                            longitude: args.longitude,
                        },
                        'batchUpdateLocations tool called'
                    )

                    const updates = args.userNames.map((userName) => ({
                        userName,
                        latitude: args.latitude,
                        longitude: args.longitude,
                    }))

                    const result = await this.batchUpdateLocations(updates)

                    const message = `📍 **Batch Location Update**

✅ Success: ${result.summary.successful}/${result.summary.total}
❌ Failed: ${result.summary.failed}
📍 Location: ${args.latitude}, ${args.longitude}

${result.results
    .map((r) => `${r.success ? '✅' : '❌'} ${r.userName}${r.error ? ` - ${r.error}` : ''}`)
    .join('\n')}`

                    return {
                        success: result.summary.successful > 0,
                        message,
                        summary: result.summary,
                    }
                },
            }),
        }
    }

    /**
     * Check if ISP service is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled
    }
}

/**
 * Singleton instance
 */
export const ispService = new ISPService()
