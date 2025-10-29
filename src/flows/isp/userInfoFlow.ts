import { addKeyword } from '@builderbot/bot'
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
export const userInfoFlow = addKeyword<Provider, Database>('EVENT_USER_INFO_DETECTED')
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from, message: ctx.body }, 'User info flow triggered')

        // Run middleware pipeline
        const middlewareResult = await runUserMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        try {
            // Extract phone number from the message using enhanced extraction
            const phoneNumber = ispApiService.extractPhoneNumberFromMessage(ctx.body, ctx.from)

            if (!phoneNumber) {
                // If no phone number found, ask user to provide one
                await sendAndLogResponse(ctx, utils,
                    '📞 *Phone Number Required*\n\n' +
                    'I need a phone number to look up user information.\n\n' +
                    'Please provide a phone number in any of these formats:\n' +
                    '• +1234567890\n' +
                    '• 123-456-7890\n' +
                    '• (123) 456-7890\n' +
                    '• 123.456.7890\n\n' +
                    'Example: "Check +1234567890" or "Info for 123-456-7890"',
                    { response_type: 'phone_required' }
                )
                return utils.fallBack()
            }

            flowLogger.info({ from: ctx.from, phoneNumber }, 'Phone number extracted, fetching user info directly')

            await sendAndLogResponse(ctx, utils, '🔍 *Searching...* Please wait while I retrieve the user information.', {
                response_type: 'searching',
                phone_number: phoneNumber
            })

            try {
                // Fetch user information from ISP API directly
                const users = await ispApiService.getUserInfo(phoneNumber)

                if (!users || users.length === 0) {
                    await sendAndLogResponse(ctx, utils,
                        `❌ *User Not Found*\n\n` +
                        `I couldn't find any user with the phone number: *${phoneNumber}*\n\n` +
                        `Please:\n• Double-check the phone number\n• Make sure the number is registered in the ISP system\n• Try a different phone number`,
                        { response_type: 'user_not_found', phone_number: phoneNumber }
                    )
                    return
                }

                // Display information for each user sequentially
                await sendAndLogResponse(ctx, utils,
                    `🔍 *Found ${users.length} user(s)* for phone number: *${phoneNumber}*\n\n` +
                    `Displaying information for each user:`,
                    {
                        response_type: 'users_found_summary',
                        phone_number: phoneNumber,
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
                        phone_number: phoneNumber,
                        user_index: i + 1,
                        total_users: users.length,
                        user_id: userInfo.id,
                        user_name: `${userInfo.firstName} ${userInfo.lastName}`
                    })

                    flowLogger.info({ from: ctx.from, userId: userInfo.id, userIndex: i + 1, totalUsers: users.length }, 'User information retrieved successfully')

                    // Add a small delay between users to avoid overwhelming the user
                    if (i < users.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500))
                    }
                }

                // Send completion message
                await sendAndLogResponse(ctx, utils,
                    `\n✅ *Complete*\n\nDisplayed information for all ${users.length} user(s) found with phone number: *${phoneNumber}*`,
                    {
                        response_type: 'all_users_displayed',
                        phone_number: phoneNumber,
                        total_users: users.length
                    }
                )

            } catch (error) {
                flowLogger.error({ err: error, from: ctx.from, phoneNumber }, 'Failed to fetch user info')
                await sendAndLogResponse(ctx, utils,
                    '❌ *Error Retrieving Information*\n\n' +
                    'I encountered an error while trying to fetch the user information. ' +
                    'This could be due to:\n• Network connectivity issues\n• ISP API being temporarily unavailable\n• Invalid phone number format\n\n' +
                    'Please try again in a few moments.',
                    { response_type: 'api_error', phone_number: phoneNumber, error: error.message }
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
 * Handle manual phone number entry when initial extraction fails
 */
export const manualPhoneEntryFlow = addKeyword<Provider, Database>(['phone', 'number', 'lookup'], { sensitive: false })
    .addAction(async (ctx, utils) => {
        flowLogger.info({ from: ctx.from, message: ctx.body }, 'Manual phone entry triggered')

        // Run middleware pipeline
        const middlewareResult = await runUserMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        // Extract phone number from the message
        const phoneNumber = intentService.extractPhoneNumber(ctx.body)

        if (!phoneNumber) {
            await sendAndLogResponse(ctx, utils,
                '📞 *Please provide a phone number*\n\n' +
                'I need a valid phone number to look up user information.\n\n' +
                'Accepted formats:\n• +1234567890\n• 123-456-7890\n• (123) 456-7890\n• 123.456.7890\n\n' +
                'Please send a message with the phone number you want to check.',
                { response_type: 'manual_phone_required' }
            )
            return utils.fallBack()
        }

        // Store and proceed with confirmation
        await utils.state.update({ phoneNumberQuery: phoneNumber })
        await sendAndLogResponse(ctx, utils,
            `🔍 *Confirm Phone Number*\n\n` +
            `I found this phone number: *${phoneNumber}*\n\n` +
            `Is this correct? Reply "yes" to proceed or "no" to try again.`,
            { response_type: 'phone_confirmation', phone_number: phoneNumber }
        )
    })