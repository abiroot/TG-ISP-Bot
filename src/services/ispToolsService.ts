import { tool } from 'ai'
import { z } from 'zod'
import { ispApiService } from '~/services/ispApiService'
import { createFlowLogger } from '~/utils/logger'
import { Personality } from '~/database/schemas/personality'

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
 * ISP Tools for AI SDK
 * SECURITY: All tools validate userPhone from experimental_context
 * and enforce proper API usage through ispApiService
 */
export const ispTools = {
    /**
     * Get user information by phone number
     */
    getUserInfo: tool({
        description: 'Look up customer information using their phone number. Use this when user asks about a customer, account details, or user information.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number to look up (can be in various formats: +1234567890, 123-456-7890, (123) 456-7890)'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupPhone: input.phoneNumber,
                },
                'Executing getUserInfo tool'
            )

            try {
                const userInfo = await ispApiService.getUserInfo(input.phoneNumber)

                if (!userInfo) {
                    return {
                        success: false,
                        message: `❌ User not found: I couldn't find any customer with phone number ${input.phoneNumber}. Please check the number and try again.`,
                        found: false,
                    }
                }

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
                toolLogger.error({ err: error, phoneNumber: input.phoneNumber }, 'Failed to get user info')
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
        description: 'Check if a customer account is online, offline, active, blocked, or expired. Use for status-related queries.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number to check status for'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupPhone: input.phoneNumber,
                },
                'Executing checkAccountStatus tool'
            )

            try {
                const userInfo = await ispApiService.getUserInfo(input.phoneNumber)

                if (!userInfo) {
                    return {
                        success: false,
                        message: `❌ User not found: No customer found with phone number ${input.phoneNumber}`,
                        found: false,
                    }
                }

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
                toolLogger.error({ err: error, phoneNumber: input.phoneNumber }, 'Failed to check account status')
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
        description: 'Get technical details like IP address, MAC address, NAS host, and connection information for a customer.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number to get technical details for'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupPhone: input.phoneNumber,
                },
                'Executing getTechnicalDetails tool'
            )

            try {
                const userInfo = await ispApiService.getUserInfo(input.phoneNumber)

                if (!userInfo) {
                    return {
                        success: false,
                        message: `❌ User not found: No customer found with phone number ${input.phoneNumber}`,
                        found: false,
                    }
                }

                const techMessage = `🌐 *Technical Details for ${userInfo.firstName} ${userInfo.lastName}*

📱 *Phone:* ${userInfo.mobile}

🔧 *Network Information:*
• IP Address: ${userInfo.ipAddress || 'Not assigned'}
• Static IP: ${userInfo.staticIP || 'None'}
• MAC Address: ${userInfo.macAddress || 'Not registered'}
• NAS Host: ${userInfo.nasHost || 'Not connected'}

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
                        online: userInfo.online,
                        accessPointOnline: userInfo.accessPointOnline,
                        stationOnline: userInfo.stationOnline,
                        uploadSpeed: userInfo.basicSpeedUp,
                        downloadSpeed: userInfo.basicSpeedDown,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, phoneNumber: input.phoneNumber }, 'Failed to get technical details')
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
        description: 'Get billing details including account price, discounts, expiry dates, and payment information.',
        inputSchema: z.object({
            phoneNumber: z.string().describe('Phone number to get billing information for'),
        }),
        execute: async (input, options) => {
            const context = options.experimental_context as ToolExecutionContext

            if (!context?.userPhone) {
                throw new Error('Security error: userPhone not found in context')
            }

            toolLogger.info(
                {
                    userPhone: context.userPhone,
                    lookupPhone: input.phoneNumber,
                },
                'Executing getBillingInfo tool'
            )

            try {
                const userInfo = await ispApiService.getUserInfo(input.phoneNumber)

                if (!userInfo) {
                    return {
                        success: false,
                        message: `❌ User not found: No customer found with phone number ${input.phoneNumber}`,
                        found: false,
                    }
                }

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
• Monthly Cost: $${userInfo.accountPrice}
• Discount Applied: ${userInfo.discount}%
• Effective Cost: $${(userInfo.accountPrice * (1 - userInfo.discount / 100)).toFixed(2)}`

                return {
                    success: true,
                    message: billingMessage,
                    found: true,
                    billing: {
                        accountPrice: userInfo.accountPrice,
                        discount: userInfo.discount,
                        effectivePrice: userInfo.accountPrice * (1 - userInfo.discount / 100),
                        expiryDate: userInfo.expiryAccount,
                        daysUntilExpiry,
                        isExpired,
                        accountType: userInfo.accountTypeName,
                        creationDate: userInfo.creationDate,
                    },
                }
            } catch (error) {
                toolLogger.error({ err: error, phoneNumber: input.phoneNumber }, 'Failed to get billing info')
                return {
                    success: false,
                    message: '❌ Error retrieving billing information. Please try again later.',
                    found: false,
                }
            }
        },
    }),
}

/**
 * Tool names for type-safe reference
 */
export const ISP_TOOL_NAMES = {
    GET_USER_INFO: 'getUserInfo',
    CHECK_ACCOUNT_STATUS: 'checkAccountStatus',
    GET_TECHNICAL_DETAILS: 'getTechnicalDetails',
    GET_BILLING_INFO: 'getBillingInfo',
} as const