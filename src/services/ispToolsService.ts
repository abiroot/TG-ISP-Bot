import { tool } from 'ai'
import { z } from 'zod'
import { ispApiService } from '~/services/ispApiService'
import { createFlowLogger } from '~/utils/logger'
import { Personality } from '~/database/schemas/personality'
import { wrapToolsWithAudit } from '~/utils/toolAuditWrapper'

const toolLogger = createFlowLogger('isp-tools')

/**
 * Tool execution context type
 * This is passed via experimental_context in generateText
 */
export interface ToolExecutionContext {
    userPhone: string
    contextId: string
    userName?: string
    personality: Personality
    userMessage: string // User's original message for context-aware validation
}

/**
 * ISP Tools for AI SDK (without audit logging)
 * SECURITY: All tools validate userPhone from experimental_context
 * and enforce proper API usage through ispApiService
 *
 * NOTE: Use `ispTools` export instead - it includes automatic audit logging
 */
const rawIspTools = {
    /**
     * Get user information by phone number or username
     */
    getUserInfo: tool({
        description: 'Look up customer information using their phone number or username. Use this when user asks about a customer, account details, or user information. Supports both phone numbers (e.g., +1234567890, 123-456-7890, (123) 456-7890) and usernames (e.g., josianeyoussef, john_doe).',
        inputSchema: z.object({
            identifier: z.string().describe('Phone number or username to look up (phone numbers can be in various formats: +1234567890, 123-456-7890, (123) 456-7890; usernames are alphanumeric like josianeyoussef or john_doe)'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupIdentifier: input.identifier,
                },
                'Executing getUserInfo tool'
            )

            try {
                const users = await ispApiService.getUserInfo(input.identifier)

                if (!users || users.length === 0) {
                    const isPhone = input.identifier.match(/^\+?\d{6,15}$/)
                    const identifierType = isPhone ? 'phone number' : 'username'
                    return {
                        success: false,
                        message: `❌ User not found: I couldn't find any customer with the ${identifierType} ${input.identifier}. Please check the ${identifierType} and try again.`,
                        found: false,
                    }
                }

                // Take the first user from the array (most common case)
                const userInfo = users[0]

                const formattedInfo = ispApiService.formatUserInfo(userInfo)

                return {
                    success: true,
                    message: formattedInfo,
                    found: true,
                    user: {
                        id: userInfo.id,
                        name: `${userInfo.firstName} ${userInfo.lastName}`,
                        mobile: userInfo.mobile,
                        online: userInfo.online,
                        active: userInfo.activatedAccount && !userInfo.blocked,
                        accountType: userInfo.accountTypeName,
                        expiryDate: userInfo.expiryAccount,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, identifier: input.identifier }, 'Failed to get user info')
                return {
                    success: false,
                    message: '❌ Error retrieving user information. The ISP API might be temporarily unavailable. Please try again later.',
                    found: false,
                }
            }
        },
    }),

    /**
     * Check account status (online/offline, active/blocked)
     */
    checkAccountStatus: tool({
        description: 'Check if a customer account is online, offline, active, blocked, or expired. Use for status-related queries. Supports both phone numbers and usernames.',
        inputSchema: z.object({
            identifier: z.string().describe('Phone number or username to check status for'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupIdentifier: input.identifier,
                },
                'Executing checkAccountStatus tool'
            )

            try {
                const users = await ispApiService.getUserInfo(input.identifier)

                if (!users || users.length === 0) {
                    const isPhone = input.identifier.match(/^\+?\d{6,15}$/)
                    const identifierType = isPhone ? 'phone number' : 'username'
                    return {
                        success: false,
                        message: `❌ User not found: No customer found with the ${identifierType} ${input.identifier}`,
                        found: false,
                    }
                }

                const userInfo = users[0]

                const statusEmoji = userInfo.online ? '🟢' : '🔴'
                const accountStatus = userInfo.activatedAccount ? '✅ Active' : '❌ Inactive'
                const blockedStatus = userInfo.blocked ? '🚫 Blocked' : '✅ Allowed'

                // Check if account is expired
                const expiryDate = new Date(userInfo.expiryAccount)
                const isExpired = expiryDate < new Date()
                const expiryStatus = isExpired ? '⏰ Expired' : '✅ Valid'

                const statusMessage = `📊 *Account Status for ${userInfo.firstName} ${userInfo.lastName}*

📱 *Phone:* ${userInfo.mobile}

🔍 *Current Status:*
• Online: ${statusEmoji} ${userInfo.online ? 'Online' : 'Offline'}
• Account: ${accountStatus}
• Access: ${blockedStatus}
• Validity: ${expiryStatus}

📅 *Details:*
• Account Type: ${userInfo.accountTypeName}
• Username: ${userInfo.userName}
• Expires: ${expiryDate.toLocaleDateString()}
• Last Login: ${userInfo.lastLogin ? new Date(userInfo.lastLogin).toLocaleString() : 'Never'}`

                return {
                    success: true,
                    message: statusMessage,
                    found: true,
                    status: {
                        online: userInfo.online,
                        active: userInfo.activatedAccount,
                        blocked: userInfo.blocked,
                        expired: isExpired,
                        accountType: userInfo.accountTypeName,
                        expiryDate: userInfo.expiryAccount,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, identifier: input.identifier }, 'Failed to check account status')
                return {
                    success: false,
                    message: '❌ Error checking account status. Please try again later.',
                    found: false,
                }
            }
        },
    }),

    /**
     * Get technical information (IP, MAC, network details)
     */
    getTechnicalDetails: tool({
        description: 'Get technical details like IP address, MAC address, NAS host, and connection information for a customer. Supports both phone numbers and usernames.',
        inputSchema: z.object({
            identifier: z.string().describe('Phone number or username to get technical details for'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupIdentifier: input.identifier,
                },
                'Executing getTechnicalDetails tool'
            )

            try {
                const users = await ispApiService.getUserInfo(input.identifier)

                if (!users || users.length === 0) {
                    const isPhone = input.identifier.match(/^\+?\d{6,15}$/)
                    const identifierType = isPhone ? 'phone number' : 'username'
                    return {
                        success: false,
                        message: `❌ User not found: No customer found with the ${identifierType} ${input.identifier}`,
                        found: false,
                    }
                }

                const userInfo = users[0]

                const techMessage = `🌐 *Technical Details for ${userInfo.firstName} ${userInfo.lastName}*

📱 *Phone:* ${userInfo.mobile}

🔧 *Network Information:*
• IP Address: ${userInfo.ipAddress || 'Not assigned'}
• Static IP: ${userInfo.staticIP || 'None'}
• MAC Address: ${userInfo.macAddress || 'Not registered'}
• NAS Host: ${userInfo.nasHost || 'Not connected'}
• Mikrotik Interface: ${userInfo.mikrotikInterface || 'N/A'}

📡 *Connection Status:*
• Online: ${userInfo.online ? '🟢 Yes' : '🔴 No'}
• Access Point: ${userInfo.accessPointOnline ? '🟢 Online' : '🔴 Offline'}
• Station: ${userInfo.stationOnline ? '🟢 Online' : '🔴 Offline'}

⚡ *Service Speeds:*
• Upload: ${userInfo.basicSpeedUp} Mbps
• Download: ${userInfo.basicSpeedDown} Mbps`

                return {
                    success: true,
                    message: techMessage,
                    found: true,
                    technical: {
                        ipAddress: userInfo.ipAddress,
                        staticIP: userInfo.staticIP,
                        macAddress: userInfo.macAddress,
                        nasHost: userInfo.nasHost,
                        mikrotikInterface: userInfo.mikrotikInterface,
                        online: userInfo.online,
                        accessPointOnline: userInfo.accessPointOnline,
                        stationOnline: userInfo.stationOnline,
                        uploadSpeed: userInfo.basicSpeedUp,
                        downloadSpeed: userInfo.basicSpeedDown,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, identifier: input.identifier }, 'Failed to get technical details')
                return {
                    success: false,
                    message: '❌ Error retrieving technical details. Please try again later.',
                    found: false,
                }
            }
        },
    }),

    /**
     * Get billing information
     */
    getBillingInfo: tool({
        description: 'Get billing details including account price, discounts, expiry dates, and payment information. Supports both phone numbers and usernames.',
        inputSchema: z.object({
            identifier: z.string().describe('Phone number or username to get billing information for'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupIdentifier: input.identifier,
                },
                'Executing getBillingInfo tool'
            )

            try {
                const users = await ispApiService.getUserInfo(input.identifier)

                if (!users || users.length === 0) {
                    const isPhone = input.identifier.match(/^\+?\d{6,15}$/)
                    const identifierType = isPhone ? 'phone number' : 'username'
                    return {
                        success: false,
                        message: `❌ User not found: No customer found with the ${identifierType} ${input.identifier}`,
                        found: false,
                    }
                }

                const userInfo = users[0]

                const expiryDate = new Date(userInfo.expiryAccount)
                const isExpired = expiryDate < new Date()
                const daysUntilExpiry = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

                let expiryWarning = ''
                if (isExpired) {
                    expiryWarning = ' ⚠️ **EXPIRED**'
                } else if (daysUntilExpiry <= 7) {
                    expiryWarning = ` ⚠️ **Expires in ${daysUntilExpiry} days**`
                }

                const billingMessage = `💰 *Billing Information for ${userInfo.firstName} ${userInfo.lastName}*

📱 *Phone:* ${userInfo.mobile}

💳 *Account Details:*
• Account Price: $${userInfo.accountPrice}
• Discount: ${userInfo.discount}%
• Account Type: ${userInfo.accountTypeName}
• Status: ${userInfo.activatedAccount ? '✅ Active' : '❌ Inactive'}

📅 *Important Dates:*
• Customer Since: ${new Date(userInfo.creationDate).toLocaleDateString()}
• Expiry Date: ${expiryDate.toLocaleDateString()}${expiryWarning}
• Last Login: ${userInfo.lastLogin ? new Date(userInfo.lastLogin).toLocaleString() : 'Never'}

💵 *Pricing Summary:*
• Base Price: $${userInfo.accountPrice.toFixed(2)}
• Real IP: $${(userInfo.realIpPrice || 0).toFixed(2)}
• IPTV: $${(userInfo.iptvPrice || 0).toFixed(2)}
• Subtotal: $${(userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)).toFixed(2)}
• Discount: ${userInfo.discount}%
• **Monthly Total:** $${((userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)) * (1 - userInfo.discount / 100)).toFixed(2)}`

                const subtotal = userInfo.accountPrice + (userInfo.realIpPrice || 0) + (userInfo.iptvPrice || 0)
                const totalPrice = subtotal * (1 - userInfo.discount / 100)

                return {
                    success: true,
                    message: billingMessage,
                    found: true,
                    billing: {
                        accountPrice: userInfo.accountPrice,
                        realIpPrice: userInfo.realIpPrice || 0,
                        iptvPrice: userInfo.iptvPrice || 0,
                        subtotal,
                        discount: userInfo.discount,
                        totalPrice,
                        expiryDate: userInfo.expiryAccount,
                        daysUntilExpiry,
                        isExpired,
                        accountType: userInfo.accountTypeName,
                        creationDate: userInfo.creationDate,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, identifier: input.identifier }, 'Failed to get billing info')
                return {
                    success: false,
                    message: '❌ Error retrieving billing information. Please try again later.',
                    found: false,
                }
            }
        },
    }),

    /**
     * Get Mikrotik user list for a specific interface
     */
    getMikrotikUserList: tool({
        description: 'Get the list of users connected to a specific Mikrotik interface. Use when user asks about users on a specific interface, router, or access point.',
        inputSchema: z.object({
            interfaceName: z.string().describe('Mikrotik interface name (e.g., (VM-PPPoe4)-vlan1607-zone4-OLT1-eliehajjarb1)'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    interfaceName: input.interfaceName,
                },
                'Executing getMikrotikUserList tool'
            )

            try {
                const userList = await ispApiService.getMikrotikUserList(input.interfaceName)
                const formattedList = ispApiService.formatMikrotikUserList(userList, input.interfaceName)

                return {
                    success: true,
                    message: formattedList,
                    found: true,
                    interface: {
                        name: input.interfaceName,
                        totalUsers: userList.length,
                        onlineUsers: userList.filter(u => u.online).length,
                        offlineUsers: userList.filter(u => !u.online).length,
                        users: userList,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, interfaceName: input.interfaceName }, 'Failed to get Mikrotik user list')
                return {
                    success: false,
                    message: `❌ Error retrieving user list for interface "${input.interfaceName}". The interface might not exist or the ISP API might be temporarily unavailable. Please check the interface name and try again.`,
                    found: false,
                }
            }
        },
    }),

    /**
     * Update user location coordinates
     */
    updateUserLocation: tool({
        description: 'Update the location coordinates for a single user in the ISP system. Use when the user wants to update location for one specific person. Supports both usernames (e.g., acc, josianeyoussef) and phone numbers.',
        inputSchema: z.object({
            userName: z.string().describe('Username or phone number of the user to update location for (e.g., acc, josianeyoussef, jhonnyacc2, 79174574)'),
            latitude: z.number().describe('Latitude coordinate (e.g., 33.8938). Must be between -90 and 90.'),
            longitude: z.number().describe('Longitude coordinate (e.g., 35.5018). Must be between -180 and 180.'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    userName: input.userName,
                    latitude: input.latitude,
                    longitude: input.longitude,
                },
                'Executing updateUserLocation tool'
            )

            try {
                // Call ISP API to update user location
                const result = await ispApiService.updateUserLocation(
                    input.userName,
                    input.latitude,
                    input.longitude
                )

                if (result.success) {
                    toolLogger.info(
                        {
                            userPhone: context.userPhone,
                            userName: input.userName,
                            latitude: input.latitude,
                            longitude: input.longitude,
                        },
                        'User location updated successfully'
                    )

                    return {
                        success: true,
                        message: `✅ **Location Updated Successfully!**\n\n👤 **User:** ${input.userName}\n📍 **Coordinates:** ${input.latitude}, ${input.longitude}\n\nThe user's location has been updated in the ISP system.`,
                        userName: input.userName,
                        coordinates: {
                            latitude: input.latitude,
                            longitude: input.longitude,
                        },
                    }
                } else {
                    toolLogger.warn(
                        {
                            userPhone: context.userPhone,
                            userName: input.userName,
                            error: result.error,
                        },
                        'Failed to update user location in ISP system'
                    )

                    return {
                        success: false,
                        message: `❌ **Failed to Update Location**\n\n👤 **User:** ${input.userName}\n📍 **Coordinates:** ${input.latitude}, ${input.longitude}\n\n**Error:** ${result.error || 'Unknown error occurred'}\n\n**Possible reasons:**\n• User doesn't exist in the system\n• Invalid coordinates provided\n• API connectivity issues`,
                        error: result.error,
                        userName: input.userName,
                    }
                }
            } catch (error) {
                toolLogger.error(
                    {
                        err: error,
                        userPhone: context.userPhone,
                        userName: input.userName,
                        latitude: input.latitude,
                        longitude: input.longitude,
                    },
                    'Error in updateUserLocation tool'
                )

                return {
                    success: false,
                    message: `❌ **Error Updating Location**\n\nFailed to update location for ${input.userName}. Please check:\n• User exists in the system\n• Coordinates are valid (latitude: -90 to 90, longitude: -180 to 180)\n• API is accessible\n\n**Technical error:** ${error instanceof Error ? error.message : 'Unknown error'}`,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userName: input.userName,
                }
            }
        },
    }),

    /**
     * Update location for multiple users (batch processing)
     */
    updateMultipleUserLocations: tool({
        description: 'Update location coordinates for multiple users at once. Use when the user wants to update the same location for several users (e.g., "we have 5 users at the tower location" or "update acc, jhonnyacc2, and 79174574").',
        inputSchema: z.object({
            userNames: z.array(z.string()).describe('Array of usernames or phone numbers to update location for (e.g., ["acc", "jhonnyacc2", "79174574"])'),
            latitude: z.number().describe('Latitude coordinate (e.g., 33.8938). Must be between -90 and 90.'),
            longitude: z.number().describe('Longitude coordinate (e.g., 35.5018). Must be between -180 and 180.'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    userCount: input.userNames.length,
                    userNames: input.userNames,
                    latitude: input.latitude,
                    longitude: input.longitude,
                },
                'Executing updateMultipleUserLocations tool'
            )

            try {
                // Prepare user locations array for batch processing
                const userLocations = input.userNames.map(userName => ({
                    userName: userName.trim(),
                    latitude: input.latitude,
                    longitude: input.longitude
                }))

                // Call ISP API for batch update
                const result = await ispApiService.updateMultipleUserLocations(userLocations)

                // Format success message with detailed results
                const successUsers = result.results.filter(r => r.success)
                const failedUsers = result.results.filter(r => !r.success)

                let message = `📍 **Batch Location Update Complete**\n\n`
                message += `📊 **Summary:** ${result.summary.successful}/${result.summary.total} successful\n\n`

                if (successUsers.length > 0) {
                    message += `✅ **Successfully Updated (${successUsers.length}):**\n`
                    successUsers.forEach(user => {
                        message += `• @${user.userName}\n`
                    })
                }

                if (failedUsers.length > 0) {
                    message += `\n❌ **Failed to Update (${failedUsers.length}):**\n`
                    failedUsers.forEach(user => {
                        message += `• @${user.userName} - ${user.error || 'Unknown error'}\n`
                    })
                }

                message += `\n🌐 **Location:** ${input.latitude}, ${input.longitude}`

                toolLogger.info(
                    {
                        userPhone: context.userPhone,
                        totalUsers: result.summary.total,
                        successful: result.summary.successful,
                        failed: result.summary.failed,
                        latitude: input.latitude,
                        longitude: input.longitude,
                    },
                    'Batch location update completed'
                )

                return {
                    success: result.summary.successful > 0,
                    message,
                    summary: result.summary,
                    results: result.results,
                    coordinates: {
                        latitude: input.latitude,
                        longitude: input.longitude,
                    },
                }

            } catch (error) {
                toolLogger.error(
                    {
                        err: error,
                        userPhone: context.userPhone,
                        userNames: input.userNames,
                        latitude: input.latitude,
                        longitude: input.longitude,
                    },
                    'Error in updateMultipleUserLocations tool'
                )

                return {
                    success: false,
                    message: `❌ **Batch Update Error**\n\nFailed to update locations for ${input.userNames.length} users. Please check:\n• All users exist in the system\n• Coordinates are valid\n• API is accessible\n\n**Technical error:** ${error instanceof Error ? error.message : 'Unknown error'}`,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    userNames: input.userNames,
                }
            }
        },
    }),
}

/**
 * ISP Tools with automatic audit logging
 *
 * All tool executions are automatically logged to tool_execution_audit table
 * for compliance, security monitoring, and analytics.
 *
 * Audit logs include:
 * - Tool name and input parameters
 * - User context (Telegram ID, username, display name)
 * - Execution timing and status (success/error/timeout)
 * - Output results or error messages
 * - Metadata (conversation context, personality, user message)
 *
 * @see toolExecutionAuditService for querying audit logs
 * @see wrapToolsWithAudit for audit wrapper implementation
 */
export const ispTools = wrapToolsWithAudit(rawIspTools)

/**
 * Tool names for type-safe reference
 */
export const ISP_TOOL_NAMES = {
    GET_USER_INFO: 'getUserInfo',
    CHECK_ACCOUNT_STATUS: 'checkAccountStatus',
    GET_TECHNICAL_DETAILS: 'getTechnicalDetails',
    GET_BILLING_INFO: 'getBillingInfo',
    GET_MIKROTIK_USER_LIST: 'getMikrotikUserList',
    UPDATE_USER_LOCATION: 'updateUserLocation',
    UPDATE_MULTIPLE_USER_LOCATIONS: 'updateMultipleUserLocations',
} as const