import { env } from '~/config/env'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('isp-api')

export interface AccessPointUser {
    userName: string
    online: boolean
}

export interface UserSession {
    startSession: string
    endSession: string | null
    sessionTime: string | null
}

export interface UserInfo {
    id: number
    userName: string
    firstName: string
    lastName: string
    mobile: string
    phone: string
    mailAddress: string
    address: string
    comment: string
    creationDate: string | null
    mof: string
    userCategoryId: number
    accountPrice: number
    realIpPrice?: number  // Optional - may not be returned by API
    iptvPrice?: number    // Optional - may not be returned by API
    discount: number
    lastLogin: string | null
    financialCategoryId: number
    userGroupId: number
    archived: boolean
    lastLogOut: string | null
    linkId: number
    activatedAccount: boolean
    expiryAccount: string | null
    staticIP: string
    ipAddress: string
    macAddress: string
    nasHost: string
    online: boolean
    active: boolean
    blocked: boolean
    fupMode: string      // Added in new API structure
    userUpTime: string
    accountTypeName: string
    basicSpeedUp: number
    basicSpeedDown: number
    collectorId: number
    collectorUserName: string
    collectorFirstName: string
    collectorLastName: string
    collectorMobile: string | null
    stationOnline: boolean
    stationName: string
    stationIpAddress: string
    stationUpTime: string
    accessPointOnline: boolean
    accessPointName: string
    accessPointIpAddress: string
    accessPointUpTime: string
    accessPointSignal: string
    routerBrand: string
    mikrotikInterface: string
    dailyQuota: string
    monthlyQuota: string
    accessPointUsers: AccessPointUser[]
    userSessions: UserSession[]
    pingResult: string[]
}

export class IspApiService {
    private authToken: string | null = null
    private tokenExpiry: number = 0
    private readonly TOKEN_BUFFER_MS = 60000 // 1 minute buffer before expiry
    private readonly baseUrl: string

    constructor() {
        // Handle both with and without /api in base URL
        this.baseUrl = env.ISP_API_BASE_URL.replace(/\/api$/, '')
    }

    /**
     * Authenticate with ISP API and get token
     */
    private async authenticate(): Promise<string> {
        try {
            // Check if current token is still valid
            if (this.authToken && Date.now() < this.tokenExpiry - this.TOKEN_BUFFER_MS) {
                logger.debug('Using cached authentication token')
                return this.authToken
            }

            logger.debug('Authenticating with ISP API')

            const response = await fetch(`${this.baseUrl}/api/authenticate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userName: env.ISP_API_USERNAME,
                    password: env.ISP_API_PASSWORD,
                }),
            })

            if (!response.ok) {
                const errorText = await response.text()
                logger.error({
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                }, 'ISP API authentication failed')
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`)
            }

            const token = await response.text()

            // Cache token for 1 hour (typical token expiry time)
            this.authToken = token
            this.tokenExpiry = Date.now() + (60 * 60 * 1000) // 1 hour

            logger.debug('Successfully authenticated with ISP API')
            return token
        } catch (error) {
            logger.error({ err: error }, 'Failed to authenticate with ISP API')
            throw new Error('ISP API authentication failed')
        }
    }

    /**
     * Get user information by mobile number - returns all matching users
     */
    async getUserInfo(mobile: string): Promise<UserInfo[]> {
        try {
            const token = await this.authenticate()

            // Clean mobile number format - remove any non-digit characters except +
            let cleanMobile = mobile.replace(/[^\d+]/g, '')

            
            // Convert Lebanese international format to local format
            // +96171534710 or 96171534710 should become 71534710
            if (cleanMobile.startsWith('+961') && cleanMobile.length === 13) {
                cleanMobile = cleanMobile.substring(4) // Remove +961
            } else if (cleanMobile.startsWith('961') && cleanMobile.length === 12) {
                cleanMobile = cleanMobile.substring(3) // Remove 961
            } else if (cleanMobile.startsWith('+961')) {
                // Handle any other +961 variations
                cleanMobile = cleanMobile.substring(4) // Remove +961
                logger.debug({ convertedMobile: cleanMobile }, 'Converted +961 format (any length) to local format')
            } else if (cleanMobile.startsWith('961')) {
                // Handle any other 961 variations
                cleanMobile = cleanMobile.substring(3) // Remove 961
                logger.debug({ convertedMobile: cleanMobile }, 'Converted 961 format (any length) to local format')
            }


            const response = await fetch(
                `${this.baseUrl}/api/user-info?mobile=${encodeURIComponent(cleanMobile)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (response.status === 404) {
                logger.debug({ mobile: cleanMobile }, 'User not found in ISP system')
                return []
            }

            if (!response.ok) {
                const errorText = await response.text()
                logger.error({
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    mobile: cleanMobile
                }, 'ISP API user info request failed')
                throw new Error(`User info request failed: ${response.status} ${response.statusText}`)
            }

            // Check if response is empty before parsing JSON
            const responseText = await response.text()
            if (!responseText.trim()) {
                logger.warn({ mobile: cleanMobile }, 'ISP API returned empty response')
                return []
            }

            // Parse the JSON response - API returns an array of users
            const usersArray: UserInfo[] = JSON.parse(responseText)

            if (!Array.isArray(usersArray) || usersArray.length === 0) {
                logger.debug({ mobile: cleanMobile }, 'No users found in ISP system response')
                return []
            }

            return usersArray
        } catch (error) {
            logger.error({ err: error, mobile }, 'Failed to get user info from ISP API')
            throw new Error('Failed to retrieve user information from ISP system')
        }
    }

    /**
     * Format user information for display
     */
    formatUserInfo(userInfo: UserInfo): string {
        const statusEmoji = userInfo.online ? '🟢' : '🔴'
        const accountStatus = userInfo.activatedAccount ? '✅ Active' : '❌ Inactive'
        const blockedStatus = userInfo.blocked ? '🚫 Blocked' : '✅ Allowed'

        // Helper function to format dates as DD/MM/YY
        const formatDate = (dateString: string | null): string => {
            if (!dateString) return 'N/A'
            try {
                const date = new Date(dateString)
                return date.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                })
            } catch {
                return 'Invalid date'
            }
        }

        // Helper function to format datetime as DD/MM/YY HH:MM
        const formatDateTime = (dateString: string | null): string => {
            if (!dateString) return 'Never'
            try {
                const date = new Date(dateString)
                return date.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            } catch {
                return 'Invalid date'
            }
        }

        // Format quota - values are already in MB from API, not KB
        const formatQuota = (quota: string): string => {
            const value = parseFloat(quota)
            if (isNaN(value)) return `${quota} (unknown unit)`

            // Display values as they come from API but always use MB unit
            return `${value.toFixed(2)} MB`
        }

        // Format access point users
        const formatApUsers = (users: AccessPointUser[]): string => {
            if (!users || users.length === 0) return 'No other users'
            const onlineUsers = users.filter(u => u.online)
            return `${onlineUsers.length}/${users.length} online:\n${users
                .map(u => `  • ${u.userName} ${u.online ? '🟢' : '🔴'}`)
                .join('\n')}`
        }

        // Format ping results summary
        const formatPingSummary = (pingResult: string[]): string => {
            if (!pingResult || pingResult.length === 0) return 'No ping data'

            // Find the summary lines
            const summaryLines = pingResult.filter(line =>
                line.includes('packet-loss') || line.includes('min-rtt') || line.includes('avg-rtt') || line.includes('max-rtt')
            )

            if (summaryLines.length > 0) {
                return summaryLines.join('\n')
            }

            return `Ping data available (${pingResult.length} lines)`
        }

        // Format user sessions
        const formatSessions = (sessions: UserSession[]): string => {
            if (!sessions || sessions.length === 0) return 'No session data'
            return sessions.map(session => {
                const start = formatDateTime(session.startSession)
                const end = session.endSession ? formatDateTime(session.endSession) : 'Active'
                const duration = session.sessionTime || 'N/A'
                return `  • ${start} → ${end} (${duration})`
            }).join('\n')
        }

        // Format detailed ping results - show raw sequence + formatted summary
        const formatDetailedPing = (pingResult: string[]): string => {
            if (!pingResult || pingResult.length === 0) return 'No ping data available'

            // Find the summary line with statistics
            const summaryLine = pingResult.find(line =>
                line.includes('sent=') && line.includes('received=') && line.includes('packet-loss=')
            )

            const maxRttLine = pingResult.find(line =>
                line.includes('max-rtt=')
            )

            let result = ''

            // Show raw ping sequence first (preserving exact API output format)
            const sequenceLines = pingResult.filter(line =>
                line.trim().match(/^\s*\d+\s+[\d.]+\s+\d+\s+\d+\s+[\dmsµus]+\s*\w*$/) ||
                line.trim().match(/^\s*\d+\s+timeout\s*$/) ||
                line.includes(' SEQ HOST SIZE TTL TIME STATUS')
            )

            if (sequenceLines.length > 0) {
                result += '🔍 **Ping Sequence:**\n```\n'
                result += sequenceLines.join('\n')
                result += '\n```\n\n'
            }

            // Format summary statistics with better display
            if (summaryLine) {
                // Extract the statistics
                const sentMatch = summaryLine.match(/sent=(\d+)/)
                const receivedMatch = summaryLine.match(/received=(\d+)/)
                const packetLossMatch = summaryLine.match(/packet-loss=(\d+%)/)
                const minRttMatch = summaryLine.match(/min-rtt=([\dmsµus]+)/)
                const avgRttMatch = summaryLine.match(/avg-rtt=([\dmsµus]+)/)
                const maxRttMatch = maxRttLine?.match(/max-rtt=([\dmsµus]+)/)

                result += '📈 **Performance Summary:**\n'

                // Packets sent/received - show real data from summary line
                if (sentMatch && receivedMatch) {
                    result += `📦 **Packet Delivery:**\n`
                    result += `  • sent=${sentMatch[1]}\n`
                    result += `  • received=${receivedMatch[1]}\n`
                }

                // Packet loss with emoji indicators
                if (packetLossMatch) {
                    const lossPercentage = packetLossMatch[1]
                    const lossNum = parseInt(lossPercentage.replace('%', ''))
                    let lossEmoji = '🟢'
                    if (lossNum > 0 && lossNum <= 5) lossEmoji = '⚠️'
                    if (lossNum > 5) lossEmoji = '🔴'
                    result += `📉 **Packet Loss:** ${lossEmoji} ${lossPercentage}\n`
                }

                // Response times with cleaner formatting
                if (minRttMatch && avgRttMatch && maxRttMatch) {
                    // Clean up the time format for better readability
                    const formatTime = (timeStr: string): string => {
                        return timeStr.replace('ms', 'ms ').replace('µs', 'μs').trim()
                    }

                    result += `⚡ **Latency Metrics:**\n`
                    result += `  • Minimum: ${formatTime(minRttMatch[1])}\n`
                    result += `  • Average: ${formatTime(avgRttMatch[1])}\n`
                    result += `  • Maximum: ${formatTime(maxRttMatch[1])}\n`
                }

  
                // Show exit status if available
                const exitStatusLine = pingResult.find(line => line.includes('exit-status:'))
                if (exitStatusLine) {
                    const statusMatch = exitStatusLine.match(/exit-status:\s*(\d+)/)
                    if (statusMatch) {
                        const exitCode = parseInt(statusMatch[1])
                        const statusEmoji = exitCode === 0 ? '✅' : '❌'
                        const statusText = exitCode === 0 ? 'Success' : 'Failed'
                        result += `\n${statusEmoji} **Test Status:** ${statusText} (exit code: ${exitCode})`
                    }
                }
            } else {
                // Fallback: show all raw data if no summary found
                result += '📋 **Raw Ping Data:**\n```\n'
                result += pingResult.join('\n')
                result += '\n```'
            }

            return result
        }

        // Check if account is expired for warning styling
        const expiryDate = new Date(userInfo.expiryAccount)
        const isExpired = expiryDate < new Date()
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

        let expiryIndicator = ''
        if (isExpired) {
            expiryIndicator = ' ⚠️ *EXPIRED*'
        } else if (daysUntilExpiry <= 7) {
            expiryIndicator = ` ⚠️ *${daysUntilExpiry} days left*`
        }

        return `
👤 **Customer Information** • ID: *${userInfo.id}*

━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 **Personal Details**
│ • Name: ${userInfo.firstName} ${userInfo.lastName}
│ • Username: @${userInfo.userName}
│ • Mobile: \`${userInfo.mobile}\`
│ • Email: ${userInfo.mailAddress || 'Not provided'}
│ • Address: ${userInfo.address || 'Not provided'}

${statusEmoji} **Account Status**
│ • Connection: ${userInfo.online ? '*Online*' : '*Offline*'}
│ • Account: ${accountStatus}
│ • Access: ${blockedStatus}
│ • Service: ${userInfo.active ? '✅ *Active*' : '❌ *Inactive*'}
│ • FUP Mode: ${userInfo.fupMode || 'Standard'}
│ • Plan: ${userInfo.accountTypeName}
│ • Expires: ${formatDate(userInfo.expiryAccount)}${expiryIndicator}

━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 **Network Configuration**
│ • IP: \`${userInfo.ipAddress || 'Not assigned'}\`
│ • Static IP: ${userInfo.staticIP || 'None'}
│ • MAC: \`${userInfo.macAddress || 'Not registered'}\`
│ • NAS: ${userInfo.nasHost || 'Not connected'}
│ • Router: ${userInfo.routerBrand || 'N/A'}
│ • Interface: ${userInfo.mikrotikInterface || 'N/A'}

⚡ **Service Performance**
│ • Upload: ${userInfo.basicSpeedUp ? (userInfo.basicSpeedUp / 1000).toFixed(1) : 'N/A'} Mbps
│ • Download: ${userInfo.basicSpeedDown ? (userInfo.basicSpeedDown / 1000).toFixed(1) : 'N/A'} Mbps
│ • Uptime: ${userInfo.userUpTime || 'N/A'}

📊 **Data Usage**
│ • Daily: ${formatQuota(userInfo.dailyQuota)}
│ • Monthly: ${formatQuota(userInfo.monthlyQuota)}

━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 **Infrastructure Status**

${userInfo.stationOnline ? '🟢' : '🔴'} **Station:** ${userInfo.stationName || 'N/A'}
│ • IP: \`${userInfo.stationIpAddress || 'N/A'}\`
│ • Uptime: ${userInfo.stationUpTime || 'N/A'}

${userInfo.accessPointOnline ? '🟢' : '🔴'} **Access Point:** ${userInfo.accessPointName || 'N/A'}
│ • IP: \`${userInfo.accessPointIpAddress || 'N/A'}\`
│ • Signal: ${userInfo.accessPointSignal || 'N/A'}
│ • Uptime: ${userInfo.accessPointUpTime || 'N/A'}

👥 **Connected Users:** ${userInfo.accessPointUsers?.filter(u => u.online).length || 0}/${userInfo.accessPointUsers?.length || 0}
${formatApUsers(userInfo.accessPointUsers)}

━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 **Billing Information**
│ • Base Price: $${userInfo.accountPrice ? userInfo.accountPrice.toFixed(2) : 'N/A'}
│ • Real IP: $${(userInfo.realIpPrice || 0).toFixed(2)}
│ • IPTV: $${(userInfo.iptvPrice || 0).toFixed(2)}
│ • Subtotal: $${userInfo.accountPrice ? (userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)).toFixed(2) : 'N/A'}
│ • Discount: ${userInfo.discount || 0}%
│ • **Monthly Total:** $${userInfo.accountPrice ? ((userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)) * (1 - (userInfo.discount || 0) / 100)).toFixed(2) : 'N/A'}

📅 **Account History**
│ • Customer Since: ${formatDate(userInfo.creationDate)}
│ • Last Login: ${formatDateTime(userInfo.lastLogin)}
│ • Last Logout: ${formatDateTime(userInfo.lastLogOut)}

━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 **Assigned Collector**
│ • Name: ${userInfo.collectorFirstName} ${userInfo.collectorLastName}
│ • Username: @${userInfo.collectorUserName}
│ • Mobile: \`${userInfo.collectorMobile || 'N/A'}\`

💬 **Notes:** ${userInfo.comment || 'No additional notes'}

🏢 **Account Categories**
│ • User Category: ${userInfo.userCategoryId}
│ • Financial Category: ${userInfo.financialCategoryId}
│ • User Group: ${userInfo.userGroupId}
│ • Link ID: ${userInfo.linkId}
│ • MOF/Reference: ${userInfo.mof || 'Not specified'}

📈 **Network Diagnostics**
\`\`\`
${formatDetailedPing(userInfo.pingResult)}
\`\`\`
`
    }

    /**
     * Search for users by name or partial mobile number
     */
    async searchUsers(query: string): Promise<UserInfo[]> {
        try {
            const token = await this.authenticate()


            // For now, we'll try the same endpoint but handle multiple results
            // In the future, this might be a dedicated search endpoint
            const response = await fetch(
                `${this.baseUrl}/api/user-info?mobile=${encodeURIComponent(query)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (response.status === 404) {
                logger.debug({ query }, 'No users found in ISP system')
                return []
            }

            if (!response.ok) {
                const errorText = await response.text()
                logger.error({
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    query
                }, 'ISP API user search request failed')
                throw new Error(`User search request failed: ${response.status} ${response.statusText}`)
            }

            const responseText = await response.text()
            if (!responseText.trim()) {
                logger.warn({ query }, 'ISP API returned empty response for search')
                return []
            }

            // API returns an array of users
            const usersArray: UserInfo[] = JSON.parse(responseText)

            if (!Array.isArray(usersArray)) {
                logger.warn({ query, responseType: typeof usersArray }, 'ISP API returned non-array response for search')
                return []
            }

            logger.debug({ query, resultCount: usersArray.length }, 'Successfully searched users in ISP API')
            return usersArray

        } catch (error) {
            logger.error({ err: error, query }, 'Failed to search users in ISP API')
            throw new Error('Failed to search users in ISP system')
        }
    }

    /**
     * Extract phone number from user message or use sender's number
     * Handles various formats: +961 71 534 710, 961 71 534 710, 71 534 710, 71534710, etc.
     * Returns phone number formatted for API (local format)
     */
    extractPhoneNumberFromMessage(message: string, senderId: string): string {

        // Clean the message first - normalize spaces and remove common separators
        const cleanMessage = message.replace(/[-.]/g, ' ').replace(/\s+/g, ' ').trim()

        // Enhanced patterns for phone numbers in natural language (including spaced formats)
        const phonePatterns = [
            // Numbers with spaces: +961 71 534 710, 961 71 534 710, 71 534 710
            /\b(?:\+?961\s?)?\d{1,2}(?:\s?\d{3}){1,2}(?:\s?\d{2,3})\b/g,
            // Standalone numbers: 71534710, +96171534710, 96171534710
            /\b(\+?\d{8,15})\b/g,
            // Numbers with context: phone number 71534710, number: 71-534-710, mobile: +961 71 534 710
            /(?:phone|number|mobile|contact)\s*[:-]?\s*((?:\+?961\s?)?\d{1,2}(?:\s?\d{3}){1,2}(?:\s?\d{2,3})|\+?\d{8,15})/gi,
            // After common phrases: for 71534710, for +961 71 534 710, at 71 534 710
            /(?:for|at|to)\s+((?:\+?961\s?)?\d{1,2}(?:\s?\d{3}){1,2}(?:\s?\d{2,3})|\+?\d{8,15})\b/gi,
        ]

        // Try to find phone numbers in the message
        for (const pattern of phonePatterns) {
            const matches = cleanMessage.match(pattern)
            if (matches) {
                for (const match of matches) {
                    // Extract just the number part and clean it
                    const phoneNumber = match.replace(/[^\d+]/g, '')

                    // Skip if it's too short or too long
                    if (phoneNumber.length < 6 || phoneNumber.length > 15) continue

                    return phoneNumber // Return as-is, will be processed by getUserInfo
                }
            }
        }

        // Fallback: Try simple extraction for edge cases
        const simpleNumberMatch = cleanMessage.match(/\b\d{6,15}\b/)
        if (simpleNumberMatch) {
            logger.debug({ foundNumber: simpleNumberMatch[0] }, 'Found simple phone number')
            return simpleNumberMatch[0]
        }

        // If no phone number found in message, return empty string
        // User must provide phone number in their message
        return ''
    }

    /**
     * Get Mikrotik user list for a specific interface
     */
    async getMikrotikUserList(mikrotikInterface: string): Promise<AccessPointUser[]> {
        try {
            const token = await this.authenticate()


            const response = await fetch(
                `${this.baseUrl}/api/mikrotik-user-list?mikrotikInterface=${encodeURIComponent(mikrotikInterface)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            )

            if (!response.ok) {
                const errorText = await response.text()
                logger.error({
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText,
                    mikrotikInterface
                }, 'ISP API Mikrotik user list request failed')
                throw new Error(`Mikrotik user list request failed: ${response.status} ${response.statusText}`)
            }

            const responseText = await response.text()
            if (!responseText.trim()) {
                logger.warn({ mikrotikInterface }, 'ISP API returned empty response for Mikrotik user list')
                return []
            }

            // API returns an array of users
            const usersArray: AccessPointUser[] = JSON.parse(responseText)

            if (!Array.isArray(usersArray)) {
                logger.warn({ mikrotikInterface, responseType: typeof usersArray }, 'ISP API returned non-array response for Mikrotik user list')
                return []
            }

            logger.debug({ mikrotikInterface, userCount: usersArray.length }, 'Successfully retrieved Mikrotik user list')
            return usersArray

        } catch (error) {
            logger.error({ err: error, mikrotikInterface }, 'Failed to get Mikrotik user list from ISP API')
            throw new Error('Failed to retrieve Mikrotik user list from ISP system')
        }
    }

    /**
     * Format Mikrotik user list for display
     */
    formatMikrotikUserList(users: AccessPointUser[], interfaceName: string): string {
        if (!users || users.length === 0) {
            return `📡 **Mikrotik Interface:** ${interfaceName}\n\n❌ No users found on this interface`
        }

        const onlineUsers = users.filter(u => u.online)
        const offlineUsers = users.filter(u => !u.online)

        let result = `📡 **Mikrotik Interface:** ${interfaceName}\n`
        result += `👥 **Users:** ${onlineUsers.length}/${users.length} online\n\n`

        if (onlineUsers.length > 0) {
            result += `🟢 **Online Users (${onlineUsers.length}):**\n`
            result += onlineUsers.map(user => `  • @${user.userName}`).join('\n')
            result += '\n\n'
        }

        if (offlineUsers.length > 0) {
            result += `🔴 **Offline Users (${offlineUsers.length}):**\n`
            result += offlineUsers.map(user => `  • @${user.userName}`).join('\n')
            result += '\n\n'
        }

        result += `📊 **Interface Summary:**\n`
        result += `• Total Users: ${users.length}\n`
        result += `• Online: ${onlineUsers.length} (${((onlineUsers.length/users.length)*100).toFixed(1)}%)\n`
        result += `• Offline: ${offlineUsers.length} (${((offlineUsers.length/users.length)*100).toFixed(1)}%)`

        return result
    }

    /**
     * Clear authentication token (useful for testing)
     */
    clearAuthCache(): void {
        this.authToken = null
        this.tokenExpiry = 0
    }
}

// Export singleton instance
export const ispApiService = new IspApiService()