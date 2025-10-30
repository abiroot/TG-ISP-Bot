import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runUserMiddleware } from '~/middleware/pipeline'
import { ispApiService } from '~/services/ispApiService'
import { intentService } from '~/services/intentService'
import { personalityService } from '~/services/personalityService'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('user-info')

/**
 * Helper function to send and log outgoing messages
 */
async function sendAndLogResponse(ctx: any, utils: any, message: string, metadata: Record<string, any> = {}) {
    await utils.flowDynamic(message)

    try {
        const { MessageLogger } = await import('~/middleware/messageLogger')
        const contextId = personalityService.getContextId(ctx.from)
        await MessageLogger.logOutgoing(contextId, ctx.from, message, undefined, {
            method: 'user_info_flow',
            ...metadata
        })
    } catch (logError) {
        flowLogger.error({ err: logError }, 'Failed to log user info response')
    }
}

/**
 * EVENT_USER_INFO_DETECTED - Triggered when intent service detects user info request
 * This flow handles retrieving and displaying user information from ISP API
 */
export const userInfoFlow = addKeyword<TelegramProvider, Database>('EVENT_USER_INFO_DETECTED')
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from, message: ctx.body }, 'User info flow triggered')

        // Run middleware pipeline
        const middlewareResult = await runUserMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        try {
            // Extract phone number from the message using enhanced extraction
            const phoneNumber = ispApiService.extractPhoneNumberFromMessage(ctx.body, ctx.from)

            if (!phoneNumber) {
                // If no user identifier found, ask user to provide one
                await sendAndLogResponse(ctx, utils,
                    '📞 *User Identifier Required*\n\n' +
                    'I need a phone number or username to look up user information.\n\n' +
                    'Please provide one of the following:\n\n' +
                    '📱 **Phone Number Formats:**\n' +
                    '• +1234567890\n' +
                    '• 123-456-7890\n' +
                    '• (123) 456-7890\n' +
                    '• 123.456.7890\n\n' +
                    '👤 **Username Formats:**\n' +
                    '• josianeyoussef\n' +
                    '• john_doe\n' +
                    '• @username\n\n' +
                    'Example: "Check +1234567890" or "Info for josianeyoussef"',
                    { response_type: 'identifier_required' }
                )
                return utils.fallBack()
            }

            flowLogger.info({ from: ctx.from, identifier: phoneNumber }, 'User identifier extracted, fetching user info directly')

            await sendAndLogResponse(ctx, utils, '🔍 *Searching...* Please wait while I retrieve the user information.', {
                response_type: 'searching',
                identifier: phoneNumber
            })

            try {
                // Fetch user information from ISP API directly
                const users = await ispApiService.getUserInfo(phoneNumber)

                if (!users || users.length === 0) {
                    await sendAndLogResponse(ctx, utils,
                        `❌ *User Not Found*\n\n` +
                        `I couldn't find any user with the identifier: *${phoneNumber}*\n\n` +
                        `Please:\n• Double-check the phone number or username\n• Make sure it's registered in the ISP system\n• Try a different identifier`,
                        { response_type: 'user_not_found', identifier: phoneNumber }
                    )
                    return
                }

                // Display information for each user sequentially
                await sendAndLogResponse(ctx, utils,
                    `🔍 *Found ${users.length} user(s)* for identifier: *${phoneNumber}*\n\n` +
                    `Displaying information for each user:`,
                    {
                        response_type: 'users_found_summary',
                        identifier: phoneNumber,
                        total_users: users.length
                    }
                )

                for (let i = 0; i < users.length; i++) {
                    const userInfo = users[i]

                    // Add user header to distinguish between users
                    const userHeader = `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 **User ${i + 1}/${users.length}** - ${userInfo.firstName} ${userInfo.lastName}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`

                    // Format and display user information
                    const formattedInfo = userHeader + ispApiService.formatUserInfo(userInfo)
                    await sendAndLogResponse(ctx, utils, formattedInfo, {
                        response_type: 'user_info_success',
                        identifier: phoneNumber,
                        user_index: i + 1,
                        total_users: users.length,
                        user_id: userInfo.id,
                        user_name: `${userInfo.firstName} ${userInfo.lastName}`
                    })

                    flowLogger.info({ from: ctx.from, userId: userInfo.id, userIndex: i + 1, totalUsers: users.length, identifier: phoneNumber }, 'User information retrieved successfully')

                    // Add a small delay between users to avoid overwhelming the user
                    if (i < users.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500))
                    }
                }

                // Send completion message
                await sendAndLogResponse(ctx, utils,
                    `\n✅ *Complete*\n\nDisplayed information for all ${users.length} user(s) found with identifier: *${phoneNumber}*`,
                    {
                        response_type: 'all_users_displayed',
                        identifier: phoneNumber,
                        total_users: users.length
                    }
                )

            } catch (error) {
                flowLogger.error({ err: error, from: ctx.from, identifier: phoneNumber }, 'Failed to fetch user info')
                await sendAndLogResponse(ctx, utils,
                    '❌ *Error Retrieving Information*\n\n' +
                    'I encountered an error while trying to fetch the user information. ' +
                    'This could be due to:\n• Network connectivity issues\n• ISP API being temporarily unavailable\n• Invalid identifier format\n\n' +
                    'Please try again in a few moments.',
                    { response_type: 'api_error', identifier: phoneNumber, error: error.message }
                )
            }
        } catch (error) {
            flowLogger.error({ err: error, from: ctx.from }, 'Error in user info flow')
            await sendAndLogResponse(ctx, utils, '❌ Sorry, I had trouble processing that request. Please try again.', {
                response_type: 'flow_error',
                error: error.message
            })
        }
    })
  
/**
 * Handle manual user identifier entry when initial extraction fails
 */
export const manualPhoneEntryFlow = addKeyword<TelegramProvider, Database>(['phone', 'number', 'lookup', 'user', 'username'], { sensitive: false })
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from, message: ctx.body }, 'Manual user identifier entry triggered')

        // Run middleware pipeline
        const middlewareResult = await runUserMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        // Extract user identifier from the message
        const identifier = intentService.extractPhoneNumber(ctx.body)

        if (!identifier) {
            await sendAndLogResponse(ctx, utils,
                '📞 *Please provide a user identifier*\n\n' +
                'I need a valid phone number or username to look up user information.\n\n' +
                '📱 **Accepted Phone Formats:**\n• +1234567890\n• 123-456-7890\n• (123) 456-7890\n• 123.456.7890\n\n' +
                '👤 **Accepted Username Formats:**\n• josianeyoussef\n• john_doe\n• @username\n\n' +
                'Please send a message with the phone number or username you want to check.',
                { response_type: 'manual_identifier_required' }
            )
            return utils.fallBack()
        }

        // Store and proceed with confirmation
        await utils.state.update({ identifierQuery: identifier })
        await sendAndLogResponse(ctx, utils,
            `🔍 *Confirm User Identifier*\n\n` +
            `I found this identifier: *${identifier}*\n\n` +
            `Is this correct? Reply "yes" to proceed or "no" to try again.`,
            { response_type: 'identifier_confirmation', identifier: identifier }
        )
    })