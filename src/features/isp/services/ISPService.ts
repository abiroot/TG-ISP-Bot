/**
 * ISP Service (v2)
 *
 * Consolidated ISP service that merges:
 * - ispApiService.ts
 * - ispToolsService.ts (654 lines with 7 tools)
 *
 * Provides 4 AI SDK tools:
 * 1. searchCustomer - Search by phone/username (replaces getUserInfo, checkAccountStatus, getTechnicalDetails, getBillingInfo)
 * 2. getMikrotikUsers - List users on Mikrotik interface with online/offline status
 * 3. updateUserLocation - Update single user location (latitude/longitude)
 * 4. batchUpdateLocations - Update multiple users to same location
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
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { ServiceError } from '~/core/errors/ServiceError'
import type { Personality } from '~/database/schemas/personality'
import { type ToolName, type RoleName } from '~/config/roles.js'
import type { RoleService } from '~/services/roleService.js'
import { extractFirstUserIdentifier } from '~/features/isp/utils/userIdentifierExtractor'
import type { LoadingMessage } from '~/core/utils/loadingIndicator'
import { splitISPMessage, type ISPMessageSections } from '~/utils/telegramMessageSplitter'
import { InsightEngine, type ISPInsight } from './InsightEngine'

const ispLogger = createFlowLogger('isp-service')

/**
 * ISP Service Error with structured error codes
 */
export class ISPServiceError extends ServiceError {
    constructor(message: string, code: string, cause?: unknown, retryable: boolean = false) {
        super('ISPService', message, code, cause, retryable)
    }
}

/**
 * Mikrotik User (from mikrotik-user-list API)
 */
export interface MikrotikUser {
    userName: string
    online: boolean
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
    private roleService: RoleService
    private insightEngine: InsightEngine

    constructor(roleService: RoleService) {
        this.roleService = roleService
        this.insightEngine = new InsightEngine()
        this.config = {
            baseUrl: env.ISP_API_BASE_URL,
            username: env.ISP_API_USERNAME,
            password: env.ISP_API_PASSWORD,
            enabled: env.ISP_ENABLED ?? true,
        }

        ispLogger.info(
            { enabled: this.config.enabled, baseUrl: this.config.baseUrl },
            'ISPService initialized with role-based access control and intelligent insights'
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
     * Get list of users on a Mikrotik interface
     */
    async getMikrotikUsers(mikrotikInterface: string): Promise<MikrotikUser[]> {
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
                `${this.config.baseUrl}/mikrotik-user-list?mikrotikInterface=${encodeURIComponent(mikrotikInterface)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!response.ok) {
                if (response.status === 404) {
                    return []
                }

                throw new ISPServiceError(
                    `Mikrotik user list failed: ${response.statusText}`,
                    'MIKROTIK_LIST_FAILED',
                    undefined,
                    response.status >= 500
                )
            }

            const users = await response.json()
            const userList = Array.isArray(users) ? users : []

            ispLogger.info(
                { mikrotikInterface, usersFound: userList.length },
                'Mikrotik user list retrieved'
            )

            return userList
        } catch (error) {
            if (error instanceof ISPServiceError) {
                throw error
            }

            ispLogger.error({ err: error, mikrotikInterface }, 'Mikrotik user list failed')
            throw new ISPServiceError(
                'Mikrotik user list failed with network error',
                'MIKROTIK_LIST_NETWORK_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Clean phone number by removing spaces and Lebanese country code
     * Examples:
     * - "+961 71 534 710" → "71534710"
     * - "961 71 534 710" → "71534710"
     * - "71 534 710" → "71534710"
     * - "josianeyoussef" → "josianeyoussef" (unchanged for usernames)
     */
    private cleanPhoneNumber(identifier: string): string {
        // Remove all spaces
        let cleaned = identifier.replace(/\s+/g, '')

        // Remove leading +961 or 961 (Lebanese country code)
        if (cleaned.startsWith('+961')) {
            cleaned = cleaned.substring(4)
        } else if (cleaned.startsWith('961')) {
            cleaned = cleaned.substring(3)
        }

        return cleaned
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

            // Clean phone number before API call
            const cleanedIdentifier = this.cleanPhoneNumber(identifier)

            const response = await fetch(
                `${this.config.baseUrl}/user-info?mobile=${encodeURIComponent(cleanedIdentifier)}`,
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

            const response = await fetch(`${this.config.baseUrl}/update-user-location`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userName, latitude, longitude }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                ispLogger.warn(
                    { userName, latitude, longitude, error: errorText },
                    'Location update failed'
                )
                return { success: false, error: errorText }
            }

            // API returns boolean: true (user exists) or false (user doesn't exist)
            const responseText = await response.text()
            const isSuccess = responseText.trim() === 'true'

            if (!isSuccess) {
                ispLogger.warn(
                    { userName, latitude, longitude, response: responseText },
                    'Location update returned false - user may not exist'
                )
                return { success: false, error: 'User not found in ISP system' }
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
     * Ping customer (network diagnostics)
     * Calls external ISP API /api/user-ping?mobile={identifier}
     *
     * @param identifier - Phone number or username
     * @returns Ping response data from ISP API
     */
    async pingCustomer(identifier: string): Promise<any> {
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
                `${this.config.baseUrl}/api/user-ping?mobile=${encodeURIComponent(identifier)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!response.ok) {
                if (response.status === 404) {
                    throw new ISPServiceError(
                        'Customer not found',
                        'CUSTOMER_NOT_FOUND',
                        undefined,
                        false
                    )
                }

                if (response.status === 401) {
                    // Token expired, clear it and retry once
                    this.authToken = null
                    this.tokenExpiry = null
                    throw new ISPServiceError('Authentication expired', 'AUTH_EXPIRED', undefined, true)
                }

                throw new ISPServiceError(
                    `Ping request failed: ${response.statusText}`,
                    'PING_REQUEST_FAILED',
                    undefined,
                    response.status >= 500
                )
            }

            const data = await response.json()
            ispLogger.info({ identifier }, 'Customer ping successful')
            return data
        } catch (error) {
            if (error instanceof ISPServiceError) {
                throw error
            }

            ispLogger.error({ err: error, identifier }, 'Customer ping failed')
            throw new ISPServiceError(
                'Ping request failed with network error',
                'PING_NETWORK_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Format date to DD/MM/YYYY HH:mm in Beirut timezone
     *
     * Handles TWO different date formats from the API:
     * 1. Session dates: "2025-11-21 03:05:07" (simple format, ALREADY in Beirut time)
     * 2. Other dates: "2025-12-18T16:59:19.000-0500" (ISO-8601 with timezone offset)
     *
     * For format 1: Parse directly without conversion (already Beirut time)
     * For format 2: Parse as ISO-8601 and convert to Beirut timezone
     */
    private formatDateBeirut(dateStr: string | null): string {
        if (!dateStr) return 'N/A'

        try {
            // Format 1: Session dates "2025-11-21 03:05:07" (ALREADY Beirut time)
            const simpleMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
            if (simpleMatch) {
                const [, year, month, day, hour, minute] = simpleMatch
                return `${day}/${month}/${year} ${hour}:${minute}`
            }

            // Format 2: ISO-8601 dates "2025-12-18T16:59:19.000-0500"
            // These include timezone offset, so we parse and convert to Beirut
            const date = new Date(dateStr)
            if (isNaN(date.getTime())) return 'Invalid Date'

            // Convert to Beirut timezone (Asia/Beirut)
            return date.toLocaleString('en-GB', {
                timeZone: 'Asia/Beirut',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).replace(',', '')
        } catch (error) {
            return 'Invalid Date'
        }
    }

    /**
     * Parse session duration from API format "0 D : 0 H : 15 M : 27 S" to "15m 27s"
     */
    private parseSessionDuration(duration: string | null): string {
        if (!duration) return 'N/A'

        try {
            // Parse format: "0 D : 0 H : 15 M : 27 S"
            const parts = duration.split(':').map(p => p.trim())
            const days = parseInt(parts[0])
            const hours = parseInt(parts[1])
            const minutes = parseInt(parts[2])
            const seconds = parseInt(parts[3])

            const result: string[] = []
            if (days > 0) result.push(`${days}d`)
            if (hours > 0) result.push(`${hours}h`)
            if (minutes > 0) result.push(`${minutes}m`)
            if (seconds > 0) result.push(`${seconds}s`)

            return result.length > 0 ? result.join(' ') : '0s'
        } catch (error) {
            return duration // Fallback to original if parsing fails
        }
    }

    /**
     * Format interface statistics for display
     * Shows connection status, speed, and link outages only (no Rx/Tx data)
     */
    private formatInterfaceStats(stats: any[] | null): string {
        if (!stats || stats.length === 0) {
            return '• No interface statistics available'
        }

        return stats
            .map((stat) => {
                const esc = (str: any, fallback = 'N/A') => html.escape(String(str || fallback))

                return `
<b>Interface:</b> <code>${esc(stat.name)}</code> (${esc(stat.type)})
- <b>MAC:</b> <code>${esc(stat.macAddress)}</code>
- <b>Speed:</b> ${esc(stat.speed, 'Unknown')}
- <b>Status:</b> ${stat.running ? '🟢 Running' : '🔴 Down'} ${stat.disabled ? '(Disabled)' : ''}
- <b>Link Downs:</b> ${esc(stat.linkDowns)}
- <b>Last Link Up:</b> ${esc(stat.lastLinkUpTime, 'Unknown')}`.trim()
            })
            .join('\n\n')
    }

    /**
     * Format ping results for display
     */
    private formatPingResults(pingResult: string[] | null): string {
        if (!pingResult || pingResult.length === 0) {
            return '• No ping data available'
        }

        // Join all ping results with proper formatting
        const pingOutput = pingResult
            .map((line) => html.escape(line.trim()))
            .join('\n')

        return `<pre>${pingOutput}</pre>`
    }

    /**
     * Check if a Mikrotik interface is an OLT or ether interface
     * These interfaces contain "OLT" or "ether" (case-insensitive)
     */
    private isOLTInterface(mikrotikInterface: string | null | undefined): boolean {
        if (!mikrotikInterface) return false
        return /OLT|ether/i.test(mikrotikInterface)
    }

    /**
     * Helper: Format interface stats for worker view (simplified)
     * Shows only: Speed, Status, Link Downs
     */
    private formatInterfaceStatsWorker(stats: any[] | null): string {
        if (!stats || stats.length === 0) {
            return '- Speed: Unknown\n- Status: Unknown\n- Link Downs: 0'
        }

        const stat = stats[0] // Use first interface only
        const esc = (str: any, fallback = 'N/A') => html.escape(String(str || fallback))

        return `- Speed: ${esc(stat.speed, 'Unknown')}
- Status: ${stat.running ? 'Running' : 'Down'}
- Link Downs: ${esc(stat.linkDowns)}`
    }

    /**
     * Format insights for display
     * Groups by severity and formats with proper HTML
     */
    private formatInsights(insights: ISPInsight[]): string | undefined {
        if (insights.length === 0) return undefined

        const critical = insights.filter((i) => i.severity === 'critical')
        const warnings = insights.filter((i) => i.severity === 'warning')
        const info = insights.filter((i) => i.severity === 'info')
        const healthy = insights.filter((i) => i.severity === 'healthy')

        let output = '🔍 <b>Intelligent Insights:</b>\n'

        // Critical issues
        if (critical.length > 0) {
            output += '\n<b>🔴 CRITICAL ISSUES:</b>\n'
            for (const insight of critical) {
                output += `• <b>${html.escape(insight.title)}:</b> ${html.escape(insight.message)}\n`
                output += `  → ${html.escape(insight.recommendation)}\n\n`
            }
        }

        // Warnings
        if (warnings.length > 0) {
            output += '<b>🟡 WARNINGS:</b>\n'
            for (const insight of warnings) {
                output += `• <b>${html.escape(insight.title)}:</b> ${html.escape(insight.message)}\n`
                output += `  → ${html.escape(insight.recommendation)}\n\n`
            }
        }

        // Info/Optimization opportunities
        if (info.length > 0) {
            output += '<b>🔵 OPTIMIZATION:</b>\n'
            for (const insight of info) {
                output += `• <b>${html.escape(insight.title)}:</b> ${html.escape(insight.message)}\n`
                output += `  → ${html.escape(insight.recommendation)}\n\n`
            }
        }

        // Healthy status (only show if no critical/warnings)
        if (critical.length === 0 && warnings.length === 0 && healthy.length > 0) {
            output += '<b>🟢 HEALTHY:</b>\n'
            for (const insight of healthy) {
                output += `• ${html.escape(insight.message)}\n`
            }
        }

        return output.trim()
    }

    /**
     * Calculate dynamic batch size based on total user count
     * Small APs: batch 3, Medium APs: batch 5, Large APs: batch 10
     */
    private getBatchSize(totalUsers: number): number {
        if (totalUsers <= 10) return 3  // Conservative for small APs
        if (totalUsers <= 30) return 5  // Balanced for medium APs
        return 10                        // Aggressive for large APs
    }

    /**
     * Split array into chunks (batches) of specified size
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = []
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize))
        }
        return chunks
    }

    /**
     * Update loading message with progress
     */
    private async updateLoadingProgress(
        provider: any,
        loadingMsg: LoadingMessage | null,
        completed: number,
        total: number
    ): Promise<void> {
        if (!provider || !loadingMsg) return

        try {
            await provider.vendor.telegram.editMessageText(
                `🔍 Fetching AP users... (${completed}/${total})`,
                {
                    chat_id: loadingMsg.chat_id,
                    message_id: loadingMsg.message_id,
                }
            )
            ispLogger.info({ completed, total }, 'Progress updated')
        } catch (error) {
            ispLogger.warn({ err: error, completed, total }, 'Failed to update progress')
        }
    }

    /**
     * Fetch detailed information for all users on the same Access Point
     * Makes individual API calls for each user to retrieve complete details
     * Uses parallel fetching with dynamic batch sizing for performance
     *
     * @param apUsers - Array of AP users from initial API response (userName + online only)
     * @param currentUserName - Current user's username to exclude from the list
     * @param provider - Optional provider for progress updates
     * @param loadingMsg - Optional loading message to update with progress
     * @returns Formatted string with detailed AP user information
     */
    private async fetchAPUserDetails(
        apUsers: Array<{ userName: string; online: boolean }>,
        currentUserName: string,
        provider?: any,
        loadingMsg?: LoadingMessage | null
    ): Promise<string> {
        // Exclude current user from the list
        const otherUsers = apUsers.filter((u) => u.userName !== currentUserName)

        if (otherUsers.length === 0) {
            return '• No other users on this AP'
        }

        const userDetails: string[] = []
        let successCount = 0
        let failureCount = 0

        // Determine batch size dynamically
        const batchSize = this.getBatchSize(otherUsers.length)

        ispLogger.info(
            {
                totalUsers: otherUsers.length,
                currentUser: currentUserName,
                batchSize
            },
            'Starting AP user details fetch (parallel batches)'
        )

        const startTime = Date.now()

        // Split users into batches
        const batches = this.chunkArray(otherUsers, batchSize)

        // Process each batch in parallel
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex]
            const batchStartTime = Date.now()

            ispLogger.info(
                {
                    batchIndex: batchIndex + 1,
                    totalBatches: batches.length,
                    batchSize: batch.length
                },
                'Processing batch'
            )

            // Fetch all users in this batch in parallel
            const batchResults = await Promise.all(
                batch.map(async (apUser) => {
                    try {
                        const userInfoArray = await this.searchCustomer(apUser.userName)

                        if (userInfoArray.length === 0) {
                            return {
                                success: false,
                                userName: apUser.userName,
                                formatted: `• ${html.escape(apUser.userName)}:\n    - ⚠️ User not found`
                            }
                        }

                        const userInfo = userInfoArray[0]

                        // Format user details
                        const onlineStatus = userInfo.online ? '🟢 Online' : '🔴 Offline'
                        const electricalStatus = userInfo.accessPointElectrical ? '⚡ Yes' : '🔌 No'
                        const uptime = html.escape(userInfo.userUpTime || '0m')

                        return {
                            success: true,
                            userName: apUser.userName,
                            formatted: `• ${html.escape(apUser.userName)}:\n    - ${onlineStatus}\n    - Electrical: ${electricalStatus}\n    - Uptime: ${uptime}`
                        }
                    } catch (error) {
                        ispLogger.error(
                            { err: error, userName: apUser.userName },
                            'Failed to fetch AP user details'
                        )
                        return {
                            success: false,
                            userName: apUser.userName,
                            formatted: `• ${html.escape(apUser.userName)}:\n    - ⚠️ Data unavailable`
                        }
                    }
                })
            )

            // Collect results
            for (const result of batchResults) {
                userDetails.push(result.formatted)
                if (result.success) {
                    successCount++
                } else {
                    failureCount++
                }
            }

            const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1)
            ispLogger.info(
                {
                    batchIndex: batchIndex + 1,
                    successful: batchResults.filter(r => r.success).length,
                    failed: batchResults.filter(r => !r.success).length,
                    durationSeconds: batchDuration
                },
                'Batch completed'
            )

            // Update progress after each batch
            const completed = (batchIndex + 1) * batch.length
            if (batchIndex < batches.length - 1) {
                // Don't update on last batch (loading message will be deleted soon)
                await this.updateLoadingProgress(provider, loadingMsg, completed, otherUsers.length)
            }
        }

        const endTime = Date.now()
        const durationSeconds = ((endTime - startTime) / 1000).toFixed(1)

        ispLogger.info(
            {
                totalUsers: otherUsers.length,
                successful: successCount,
                failed: failureCount,
                batchSize,
                totalBatches: batches.length,
                durationSeconds,
            },
            'AP user details fetch completed (parallel)'
        )

        return userDetails.join('\n')
    }

    /**
     * Format user info for display with role-based visibility
     * Async to support OLT interface handling with getMikrotikUsers
     * Returns array of messages to handle Telegram's 4096 character limit
     *
     * @param userInfo - ISP user information
     * @param userRole - User's role (admin or worker)
     * @param provider - Optional provider for AP user progress updates
     * @param loadingMsg - Optional loading message to update with progress
     */
    async formatUserInfo(
        userInfo: ISPUserInfo,
        userRole: RoleName = 'admin',
        provider?: any,
        loadingMsg?: LoadingMessage | null
    ): Promise<string[]> {
        const statusEmoji = userInfo.online ? '🟢' : '🔴'
        const accountStatus = userInfo.activatedAccount ? '✅ Activated' : '❌ Not Activated'
        const activeStatus = userInfo.active ? '✅ Active' : '❌ Inactive'
        const blockedStatus = userInfo.blocked ? '🚫 Blocked' : '✅ Allowed'
        const archivedStatus = userInfo.archived ? '📦 Archived' : '📂 Not Archived'

        const expiryDate = new Date(userInfo.expiryAccount)
        const isExpired = expiryDate < new Date()
        const expiryStatus = isExpired ? '⏰ Expired' : '✅ Valid'

        // Check if this is an OLT interface
        const isOLT = this.isOLTInterface(userInfo.mikrotikInterface)

        // Escape helper - only escape raw user data
        const esc = (str: string | null | undefined, fallback = 'N/A') => {
            return html.escape(str || fallback)
        }

        // Format quotas (values are in MB, convert to GB if >= 1024 MB)
        const formatQuota = (quota: string | null | undefined): string => {
            if (!quota || quota === '0') return '0.00 GB'
            const quotaMB = parseFloat(quota) // Value is already in MB
            if (quotaMB >= 1024) {
                return `${(quotaMB / 1024).toFixed(2)} GB`
            }
            return `${quotaMB.toFixed(2)} MB`
        }

        // All sessions with improved formatting
        const allSessions = userInfo.userSessions
            .map((session) => {
                const start = this.formatDateBeirut(session.startSession)
                const end = session.endSession ? this.formatDateBeirut(session.endSession) : '🟢 Active'
                const duration = this.parseSessionDuration(session.sessionTime)
                return `• ${start} → ${end}\n  ⏱️ ${duration}`
            })
            .join('\n')

        // Access point users - fetch detailed information for each user
        let apUsers: string
        if (isOLT && userInfo.mikrotikInterface) {
            // For OLT interfaces, fetch users from getMikrotikUsers
            try {
                const mikrotikUsers = await this.getMikrotikUsers(userInfo.mikrotikInterface)
                if (mikrotikUsers.length === 0) {
                    apUsers = '• No users found on this interface'
                } else {
                    // Fetch detailed information for each Mikrotik user (with progress updates)
                    apUsers = await this.fetchAPUserDetails(
                        mikrotikUsers,
                        userInfo.userName,
                        provider,
                        loadingMsg
                    )
                }
            } catch (error) {
                ispLogger.error({ err: error, mikrotikInterface: userInfo.mikrotikInterface }, 'Failed to fetch Mikrotik users for OLT interface')
                apUsers = '• Unable to fetch user list'
            }
        } else {
            // For non-OLT interfaces, fetch detailed information for accessPointUsers (with progress updates)
            try {
                apUsers = await this.fetchAPUserDetails(
                    userInfo.accessPointUsers,
                    userInfo.userName,
                    provider,
                    loadingMsg
                )
            } catch (error) {
                ispLogger.error({ err: error }, 'Failed to fetch AP user details')
                apUsers = '• Unable to fetch AP user details'
            }
        }

        // Determine if user is admin or worker
        const isAdmin = userRole === 'admin'
        const isWorker = userRole === 'worker'

        // Generate intelligent insights
        const insights = this.insightEngine.generateInsights(userInfo)
        const insightsSection = this.formatInsights(insights)

        // Build optional sections based on interface type and role
        const stationSection = !isOLT
            ? isAdmin
                ? `
📡 <b>Station Information:</b>
- <b>Status:</b> ${userInfo.stationOnline ? '🟢 Online' : '🔴 Offline'}
- <b>Name:</b> ${esc(userInfo.stationName)}
- <b>IP:</b> <code>${esc(userInfo.stationIpAddress)}</code>
- <b>Uptime:</b> ${esc(userInfo.stationUpTime)}

📊 <b>Station Interface Stats:</b>
${this.formatInterfaceStats(userInfo.stationInterfaceStats)}
`
                : `
📡 <b>Station:</b> ${esc(userInfo.stationName)} (${userInfo.stationOnline ? 'Online' : 'Offline'})
${this.formatInterfaceStatsWorker(userInfo.stationInterfaceStats)}
`
            : ''

        const accessPointSection = !isOLT
            ? isAdmin
                ? `
📶 <b>Access Point:</b>
- <b>Status:</b> ${userInfo.accessPointOnline ? '🟢 Online' : '🔴 Offline'}
- <b>Name:</b> ${esc(userInfo.accessPointName)}
- <b>IP:</b> <code>${esc(userInfo.accessPointIpAddress)}</code>
- <b>Uptime:</b> ${esc(userInfo.accessPointUpTime)}
- <b>Signal:</b> ${esc(userInfo.accessPointSignal)}
- <b>Electrical:</b> ${userInfo.accessPointElectrical ? '⚡ Yes' : '🔌 No'}

📊 <b>Access Point Interface Stats:</b>
${this.formatInterfaceStats(userInfo.accessPointInterfaceStats)}
`
                : `
📶 <b>Access Point:</b> ${esc(userInfo.accessPointName)} (${userInfo.accessPointOnline ? 'Online' : 'Offline'})
${this.formatInterfaceStatsWorker(userInfo.accessPointInterfaceStats)}
`
            : ''

        // Build message sections based on role
        const sections: ISPMessageSections = isWorker
            ? {
                  // WORKER FORMAT - Simplified view
                  header: `Here is the basic information for user <b>${esc(userInfo.userName)}</b>:`,

                  userDetails: `
👤 <b>User:</b> ${esc(userInfo.userName)}
📍 <b>Address:</b> ${esc(userInfo.address)}
📱 <b>Mobile:</b> ${esc(userInfo.mobile)}
${statusEmoji} ${userInfo.online ? 'Online' : 'Offline'} | ${userInfo.active ? '✅ Active' : '❌ Inactive'}
📊 <b>FUP:</b> ${esc(userInfo.fupMode)} | <b>Daily Quota:</b> ${formatQuota(userInfo.dailyQuota)}`.trim(),

                  stationInfo: stationSection.trim() || undefined,

                  accessPointInfo: accessPointSection.trim() || undefined,

                  apUsers: `
👥 <b>Users on Same AP:</b>
${apUsers || '• None'}`.trim(),

                  billing: `
💰 <b>Account Price:</b> $${userInfo.accountPrice}`.trim(),

                  pingDiagnostics: `
🔍 <b>Ping Diagnostics:</b>
${this.formatPingResults(userInfo.pingResult)}`.trim(),

                  insights: insightsSection,
              }
            : {
                  // ADMIN FORMAT - Exact fields and order as specified
                  header: `Here is the <b>complete information</b> for user <b>${esc(userInfo.userName)}</b>:`,

                  userDetails: `
👤 <b>User Details:</b>
- <b>Username:</b> <code>${esc(userInfo.userName)}</code>
- <b>Mobile:</b> ${esc(userInfo.mobile)}
- <b>Address:</b> ${esc(userInfo.address)}
- <b>Comment:</b> ${esc(userInfo.comment, 'None')}`.trim(),

                  accountStatus: `
📊 <b>Account Status:</b>
- <b>Online:</b> ${statusEmoji} ${userInfo.online ? `Online (${esc(userInfo.userUpTime)})` : 'Offline'}
- <b>Active:</b> ${activeStatus}
- <b>Validity:</b> ${expiryStatus}
- <b>Type:</b> ${esc(userInfo.accountTypeName)}
- <b>FUP:</b> ${esc(userInfo.fupMode)}
- <b>Electrical:</b> ${userInfo.accessPointElectrical ? '⚡ Yes' : '🔌 No'}`.trim(),

                  networkDetails: `
🌐 <b>Network Details:</b>
- <b>IP Address:</b> <code>${esc(userInfo.ipAddress, 'Not assigned')}</code>
- <b>Static IP:</b> ${esc(userInfo.staticIP, 'None')}
- <b>NAS Host:</b> <code>${esc(userInfo.nasHost, 'Not connected')}</code>
- <b>Mikrotik Interface:</b> <code>${esc(userInfo.mikrotikInterface, 'Not assigned')}</code>
- <b>Router Brand:</b> ${esc(userInfo.routerBrand, 'Unknown')}
- <b>Speed:</b> ↑${userInfo.basicSpeedUp} Mbps / ↓${userInfo.basicSpeedDown} Mbps
- <b>Daily Quota:</b> ${formatQuota(userInfo.dailyQuota)}
- <b>Monthly Quota:</b> ${formatQuota(userInfo.monthlyQuota)}`.trim(),

                  stationInfo: stationSection.trim() || undefined,

                  accessPointInfo: accessPointSection.trim() || undefined,

                  apUsers: `
👥 <b>Users on Same AP:</b>
${apUsers || '• None'}`.trim(),

                  billing: `
💰 <b>Billing Information:</b>
- <b>Account Price:</b> $${userInfo.accountPrice}
- <b>Expires:</b> ${this.formatDateBeirut(userInfo.expiryAccount)}`.trim(),

                  collector: `
👨‍💼 <b>Collector:</b> ${esc(userInfo.collectorFirstName)} ${esc(userInfo.collectorLastName)}`.trim(),

                  timeline: `
📅 <b>Timeline:</b>
- <b>Last Login:</b> ${this.formatDateBeirut(userInfo.lastLogin)}
- <b>Last Logout:</b> ${this.formatDateBeirut(userInfo.lastLogOut)}`.trim(),

                  sessionHistory: allSessions
                      ? `
🕐 <b>Session History:</b>
${allSessions}`.trim()
                      : `
🕐 <b>Session History:</b>
• No sessions`.trim(),

                  pingDiagnostics: `
🔍 <b>Ping Diagnostics:</b>
${this.formatPingResults(userInfo.pingResult)}`.trim(),

                  insights: insightsSection,
              }

        // Split into multiple messages if needed (respects Telegram's 4096 char limit)
        return splitISPMessage(sections)
    }

    /**
     * Extract phone number from message
     * Uses the robust userIdentifierExtractor utility
     */
    extractPhoneNumberFromMessage(message: string, fallback?: string): string | null {
        const result = extractFirstUserIdentifier(message)

        if (result) {
            // For phone numbers, use normalized version if available
            if (result.type === 'phone' && result.normalized) {
                return result.normalized
            }
            // For usernames or non-normalized phones, use the value
            return result.value
        }

        // Only use fallback if explicitly provided
        return fallback || null
    }

    /**
     * Check if user has permission to execute a tool
     *
     * Uses database-backed RoleService for permission checks
     *
     * @param context - AI SDK experimental_context containing user info
     * @param toolName - Name of the tool being executed
     * @returns Promise with permission status and message
     */
    private async checkToolPermission(context: any, toolName: ToolName): Promise<{ allowed: boolean; message?: string }> {
        // Extract user Telegram ID from context
        const userTelegramId = context?.userPhone || context?.contextId?.split('_')[0]

        if (!userTelegramId) {
            ispLogger.error({ context }, 'No user ID found in context for permission check')
            return {
                allowed: false,
                message: '🚫 Unable to verify user identity. Please try again.'
            }
        }

        // Check permission using database-backed RoleService
        const hasPermission = await this.roleService.hasToolPermission(userTelegramId, toolName)

        if (!hasPermission) {
            const userRoles = await this.roleService.getUserRoles(userTelegramId)
            ispLogger.warn(
                {
                    userTelegramId,
                    userRoles,
                    toolName,
                    attemptedAction: 'tool_execution'
                },
                'User attempted to execute tool without permission'
            )

            return {
                allowed: false,
                message: `🚫 **Permission Denied**\n\nYou don't have permission to use this tool.\n\n**Your roles:** ${userRoles.length > 0 ? userRoles.join(', ') : 'None'}\n**Tool:** ${toolName}\n\nContact an administrator to request access.`
            }
        }

        const userRoles = await this.roleService.getUserRoles(userTelegramId)
        ispLogger.info(
            {
                userTelegramId,
                toolName,
                roles: userRoles
            },
            'Tool permission check passed'
        )

        return { allowed: true }
    }

    /**
     * Get ISP tools for AI SDK v5 with role-based access control
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
                execute: async (args, { experimental_context }) => {
                    // Permission check (database-backed)
                    const permissionCheck = await this.checkToolPermission(experimental_context, 'searchCustomer')
                    if (!permissionCheck.allowed) {
                        return {
                            success: false,
                            message: permissionCheck.message,
                            found: false,
                        }
                    }

                    // Get user role for formatting (admin vs worker view)
                    const context = experimental_context as any
                    const userTelegramId = context?.userPhone || context?.contextId?.split('_')[0]
                    const userRoles = await this.roleService.getUserRoles(userTelegramId || '')
                    const primaryRole: RoleName = userRoles.includes('admin') ? 'admin' : 'worker'

                    ispLogger.info(
                        { identifier: args.identifier, userRole: primaryRole },
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

                    // Return all users with formatted messages (role-aware formatting)
                    // formatUserInfo now returns string[] for each user to handle Telegram's 4096 char limit
                    // Flatten all message arrays into single array
                    const allUserMessages = await Promise.all(users.map((user) => this.formatUserInfo(user, primaryRole)))
                    const flattenedMessages = allUserMessages.flat() // Flatten string[][] to string[]

                    return {
                        success: true,
                        message: flattenedMessages[0], // First message for AI SDK compatibility
                        messages: flattenedMessages, // All messages (flattened) for multi-message handling
                        found: true,
                        users,
                        multipleResults: users.length > 1,
                        resultCount: users.length,
                    }
                },
            }),

            getMikrotikUsers: tool({
                description:
                    'Get list of users connected to a specific Mikrotik interface. Returns usernames and online status. Use when user asks about users on a specific interface/router/AP.',
                inputSchema: z.object({
                    mikrotikInterface: z
                        .string()
                        .describe(
                            'Mikrotik interface name (e.g., "(VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1", "(VM-PPPoe2)-vlan1403-MANOLLY-TO-TOURELLE")'
                        ),
                }),
                execute: async (args, { experimental_context }) => {
                    // Permission check (database-backed)
                    const permissionCheck = await this.checkToolPermission(experimental_context, 'getMikrotikUsers')
                    if (!permissionCheck.allowed) {
                        return {
                            success: false,
                            message: permissionCheck.message,
                            found: false,
                            users: [],
                        }
                    }

                    ispLogger.info(
                        { mikrotikInterface: args.mikrotikInterface },
                        'getMikrotikUsers tool called'
                    )

                    const users = await this.getMikrotikUsers(args.mikrotikInterface)

                    if (users.length === 0) {
                        return {
                            success: true,
                            message: `📡 <b>Mikrotik Interface:</b> <code>${html.escape(args.mikrotikInterface)}</code>\n\n❌ No users found on this interface.`,
                            found: false,
                            users: [],
                        }
                    }

                    const onlineCount = users.filter((u) => u.online).length
                    const offlineCount = users.length - onlineCount

                    const userList = users
                        .map((u) => `${u.online ? '🟢' : '🔴'} <code>${html.escape(u.userName)}</code>`)
                        .join('\n')

                    const message = `📡 <b>Mikrotik Interface:</b> <code>${html.escape(args.mikrotikInterface)}</code>

👥 <b>Total Users:</b> ${users.length}
🟢 <b>Online:</b> ${onlineCount}
🔴 <b>Offline:</b> ${offlineCount}

<b>User List:</b>
${userList}`

                    return {
                        success: true,
                        message,
                        found: true,
                        users,
                        stats: {
                            total: users.length,
                            online: onlineCount,
                            offline: offlineCount,
                        },
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
                execute: async (args, { experimental_context }) => {
                    // Permission check (CRITICAL - Write operation, database-backed)
                    const permissionCheck = await this.checkToolPermission(experimental_context, 'updateUserLocation')
                    if (!permissionCheck.allowed) {
                        return {
                            success: false,
                            message: permissionCheck.message,
                        }
                    }

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
                execute: async (args, { experimental_context }) => {
                    // Permission check (CRITICAL - Batch write operation, database-backed)
                    const permissionCheck = await this.checkToolPermission(experimental_context, 'batchUpdateLocations')
                    if (!permissionCheck.allowed) {
                        return {
                            success: false,
                            message: permissionCheck.message,
                            summary: {
                                total: args.userNames.length,
                                successful: 0,
                                failed: args.userNames.length,
                            },
                        }
                    }

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
 *
 * NOTE: This will be initialized with RoleService in app.ts
 * DO NOT use this export directly - it's created on-demand in app.ts
 */
// export const ispService = new ISPService(roleService) // Removed - initialized in app.ts now
