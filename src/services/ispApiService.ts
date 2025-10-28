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
     * Get user information by mobile number
     */
    async getUserInfo(mobile: string): Promise<UserInfo | null> {
        try {
            const token = await this.authenticate()

            // Clean mobile number format - remove any non-digit characters except +
            let cleanMobile = mobile.replace(/[^\d+]/g, '')

            logger.debug({ originalMobile: mobile, cleanMobile }, 'Processing mobile number for ISP API')

            // Convert Lebanese international format to local format
            // +96171534710 or 96171534710 should become 71534710
            if (cleanMobile.startsWith('+961') && cleanMobile.length === 13) {
                cleanMobile = cleanMobile.substring(4) // Remove +961
                logger.debug({ convertedMobile: cleanMobile }, 'Converted +961 format to local format')
            } else if (cleanMobile.startsWith('961') && cleanMobile.length === 12) {
                cleanMobile = cleanMobile.substring(3) // Remove 961
                logger.debug({ convertedMobile: cleanMobile }, 'Converted 961 format to local format')
            } else if (cleanMobile.startsWith('+961')) {
                // Handle any other +961 variations
                cleanMobile = cleanMobile.substring(4) // Remove +961
                logger.debug({ convertedMobile: cleanMobile }, 'Converted +961 format (any length) to local format')
            } else if (cleanMobile.startsWith('961')) {
                // Handle any other 961 variations
                cleanMobile = cleanMobile.substring(3) // Remove 961
                logger.debug({ convertedMobile: cleanMobile }, 'Converted 961 format (any length) to local format')
            }

            logger.debug({ finalMobile: cleanMobile }, 'Final mobile number for ISP API request')

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
                return null
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
                return null
            }

            const userInfo: UserInfo = JSON.parse(responseText)
            logger.debug({ mobile: cleanMobile, userId: userInfo.id }, 'Successfully retrieved user info')

            return userInfo
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

        // Format quota - values are already in GB/MB from API, not KB
        const formatQuota = (quota: string): string => {
            const value = parseFloat(quota)
            if (isNaN(value)) return `${quota} (unknown unit)`

            // Values appear to be in GB already (e.g., 910.8573 GB, 341336.1369 GB)
            if (value > 1000) {
                return `${value.toFixed(2)} GB`
            } else if (value > 1) {
                return `${value.toFixed(2)} GB`
            } else {
                // If less than 1, assume it's in MB
                return `${(value * 1024).toFixed(2)} MB`
            }
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

        return `👤 *Customer Information*

📱 *Contact:*
• Name: ${userInfo.firstName} ${userInfo.lastName}
• Mobile: ${userInfo.mobile}
• Phone: ${userInfo.phone || 'N/A'}
• Email: ${userInfo.mailAddress || 'N/A'}
🏠 *Address:* ${userInfo.address || 'N/A'}

📊 *Account Status:*
• Status: ${statusEmoji} ${userInfo.online ? 'Online' : 'Offline'}
• Account: ${accountStatus}
• Access: ${blockedStatus}
• Active: ${userInfo.active ? '✅ Yes' : '❌ No'}
• Type: ${userInfo.accountTypeName}
• Username: ${userInfo.userName}

🌐 *Network Details:*
• IP Address: ${userInfo.ipAddress || 'Not assigned'}
• Static IP: ${userInfo.staticIP || 'None'}
• MAC Address: ${userInfo.macAddress || 'Not registered'}
• NAS Host: ${userInfo.nasHost || 'Not connected'}
• Router: ${userInfo.routerBrand || 'N/A'}
• Interface: ${userInfo.mikrotikInterface || 'N/A'}

⚡ *Connection Speeds:*
• Upload: ${(userInfo.basicSpeedUp / 1000).toFixed(1)} Mbps
• Download: ${(userInfo.basicSpeedDown / 1000).toFixed(1)} Mbps

📊 *Data Usage:*
• Daily: ${formatQuota(userInfo.dailyQuota)}
• Monthly: ${formatQuota(userInfo.monthlyQuota)}

📡 *Station Info:*
• Name: ${userInfo.stationName || 'N/A'}
• IP: ${userInfo.stationIpAddress || 'N/A'}
• Status: ${userInfo.stationOnline ? '🟢 Online' : '🔴 Offline'}
• Uptime: ${userInfo.stationUpTime || 'N/A'}

📶 *Access Point:*
• Name: ${userInfo.accessPointName || 'N/A'}
• IP: ${userInfo.accessPointIpAddress || 'N/A'}
• Status: ${userInfo.accessPointOnline ? '🟢 Online' : '🔴 Offline'}
• Signal: ${userInfo.accessPointSignal || 'N/A'}
• Uptime: ${userInfo.accessPointUpTime || 'N/A'}

👥 *AP Users:*
${formatApUsers(userInfo.accessPointUsers)}

💰 *Billing:*
• Base Price: $${userInfo.accountPrice.toFixed(2)}${userInfo.realIpPrice ? `\n• Real IP: $${userInfo.realIpPrice.toFixed(2)}` : ''}${userInfo.iptvPrice ? `\n• IPTV: $${userInfo.iptvPrice.toFixed(2)}` : ''}
• Subtotal: $${(userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)).toFixed(2)}
• Discount: ${userInfo.discount}%
• Final: $${((userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)) * (1 - userInfo.discount / 100)).toFixed(2)}
• Expiry: ${formatDate(userInfo.expiryAccount)}

📅 *History:*
• Customer Since: ${formatDate(userInfo.creationDate)}
• Last Login: ${formatDateTime(userInfo.lastLogin)}
• Last Logout: ${formatDateTime(userInfo.lastLogOut)}
• User Uptime: ${userInfo.userUpTime || 'N/A'}

👤 *Collector:*
• Name: ${userInfo.collectorFirstName} ${userInfo.collectorLastName}
• Username: ${userInfo.collectorUserName}
• Mobile: ${userInfo.collectorMobile || 'N/A'}

💬 *Notes:* ${userInfo.comment || 'No notes'}

📈 *Network Test:*
${formatPingSummary(userInfo.pingResult)}
`
    }

    /**
     * Search for users by name or partial mobile number
     */
    async searchUsers(query: string): Promise<UserInfo[]> {
        // Note: This would need to be implemented based on available ISP API endpoints
        // For now, we'll return empty array as placeholder
        logger.warn({ query }, 'User search not yet implemented in ISP API')
        return []
    }

    /**
     * Extract phone number from user message or use sender's number
     * Handles various formats: +961 71 534 710, 961 71 534 710, 71 534 710, 71534710, etc.
     * Returns phone number formatted for API (local format)
     */
    extractPhoneNumberFromMessage(message: string, senderId: string): string {
        logger.debug({ message, senderId }, 'Extracting phone number from message')

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

                    logger.debug({ foundNumber: phoneNumber, originalMatch: match }, 'Found phone number in message')
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
        logger.debug({ senderId }, 'No phone number found in message')
        return ''
    }

    /**
     * Clear authentication token (useful for testing)
     */
    clearAuthCache(): void {
        this.authToken = null
        this.tokenExpiry = 0
        logger.debug('Authentication cache cleared')
    }
}

// Export singleton instance
export const ispApiService = new IspApiService()