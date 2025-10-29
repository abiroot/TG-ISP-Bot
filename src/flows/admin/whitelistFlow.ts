import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runAdminMiddleware } from '~/middleware/pipeline'
import { whitelistService } from '~/services/whitelistService'
import { personalityService } from '~/services/personalityService'
import { normalizePhoneNumber } from '~/utils/phoneNormalizer'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('whitelist')

export const whitelistGroupFlow = addKeyword<TelegramProvider, Database>(
    ['whitelist group', '/whitelist group', 'wl group', 'wl grp'],
    {
        sensitive: false, // Case insensitive - allows "WHITELIST GROUP", "Whitelist Group", etc.
    }
)
    .addAction(async (ctx, utils) => {
        // Note: Message logging now handled automatically by event listeners in app.ts

        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        const contextId = personalityService.getContextId(ctx.from)
        const contextType = personalityService.getContextType(ctx.from)

        if (contextType !== 'group') {
            await utils.flowDynamic('⚠️ This command can only be used in a group chat.')
            return
        }

        try {
            await whitelistService.whitelistGroup(contextId, ctx.from)
            flowLogger.info({ contextId, addedBy: ctx.from }, 'Group whitelisted')
            await utils.flowDynamic('✅ This group has been whitelisted! I will now respond to messages here.')
        } catch (error) {
            flowLogger.error({ err: error, contextId }, 'Failed to whitelist group')
            await utils.flowDynamic('❌ Failed to whitelist group. Please try again.')
        }
    })

export const whitelistNumberFlow = addKeyword<TelegramProvider, Database>(
    ['whitelist number', '/whitelist number', 'wl number', 'wl num'],
    {
        sensitive: false,
    }
)
    .addAction(async (ctx, utils) => {
        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        // Check if phone number is provided inline (e.g., "/wl number +96170118353")
        const message = ctx.body.trim()
        const parts = message.split(/\s+/)

        // If there are more than 2 parts, likely has inline user identifier
        // Examples: "wl number +96170118353", "/wl number @username", "wl number 2021834510"
        if (parts.length > 2) {
            // Extract everything after the command as potential user identifier
            const potentialUser = parts.slice(2).join('')

            try {
                // For phone numbers, normalize format; for usernames/IDs, use as-is
                let userIdentifier = potentialUser
                if (potentialUser.startsWith('+')) {
                    userIdentifier = normalizePhoneNumber(potentialUser)
                }

                await whitelistService.whitelistNumber(userIdentifier, ctx.from)
                flowLogger.info({ userIdentifier, addedBy: ctx.from }, 'User whitelisted (inline)')
                await utils.flowDynamic(`✅ User ${userIdentifier} has been whitelisted!`)
                return // Exit early, don't prompt for user
            } catch (error: any) {
                // If normalization fails, inform user and fall through to prompt
                await utils.flowDynamic(
                    `⚠️ Invalid phone number format: ${error.message}\n\nPlease send a valid phone number (e.g., +96171711101), Telegram ID (e.g., 2021834510), or username (e.g., @username)`
                )
                return
            }
        }

        // No inline user provided, prompt for it
        await utils.flowDynamic(
            'Please send the user to whitelist: phone number (e.g., +96171711101), Telegram ID (e.g., 2021834510), or username (e.g., @username)'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const userInput = ctx.body.trim()

        try {
            // For phone numbers, normalize format; for usernames/IDs, use as-is
            let userIdentifier = userInput
            if (userInput.startsWith('+')) {
                userIdentifier = normalizePhoneNumber(userInput)
            }

            await whitelistService.whitelistNumber(userIdentifier, ctx.from)
            flowLogger.info({ userIdentifier, addedBy: ctx.from }, 'User whitelisted')
            await utils.flowDynamic(`✅ User ${userIdentifier} has been whitelisted!`)
        } catch (error: any) {
            flowLogger.error({ err: error, userInput }, 'Failed to whitelist user')
            await utils.flowDynamic(
                `❌ Failed to whitelist user: ${error.message}\n\nPlease use phone number (e.g., +96171711101), Telegram ID (e.g., 2021834510), or username (e.g., @username)`
            )
        }
    })

export const removeGroupFlow = addKeyword<TelegramProvider, Database>(['remove group', '/remove group'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        const contextId = personalityService.getContextId(ctx.from)
        const contextType = personalityService.getContextType(ctx.from)

        if (contextType !== 'group') {
            await utils.flowDynamic('⚠️ This command can only be used in a group chat.')
            return
        }

        try {
            const removed = await whitelistService.removeGroup(contextId)
            if (removed) {
                flowLogger.info({ contextId, removedBy: ctx.from }, 'Group removed from whitelist')
                await utils.flowDynamic('✅ This group has been removed from the whitelist. I will no longer respond here.')
            } else {
                flowLogger.warn({ contextId }, 'Group not in whitelist')
                await utils.flowDynamic('⚠️ This group was not in the whitelist.')
            }
        } catch (error) {
            flowLogger.error({ err: error, contextId }, 'Failed to remove group')
            await utils.flowDynamic('❌ Failed to remove group. Please try again.')
        }
    })

export const removeNumberFlow = addKeyword<TelegramProvider, Database>(['remove number', '/remove number'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        await utils.flowDynamic(
            'Please send the user to remove: phone number (e.g., +96171711101), Telegram ID (e.g., 2021834510), or username (e.g., @username)'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        const userInput = ctx.body.trim()

        try {
            // For phone numbers, normalize format; for usernames/IDs, use as-is
            let userIdentifier = userInput
            if (userInput.startsWith('+')) {
                userIdentifier = normalizePhoneNumber(userInput)
            }

            const removed = await whitelistService.removeNumber(userIdentifier)
            if (removed) {
                flowLogger.info({ userIdentifier, removedBy: ctx.from }, 'User removed from whitelist')
                await utils.flowDynamic(`✅ User ${userIdentifier} has been removed from the whitelist.`)
            } else {
                flowLogger.warn({ userIdentifier }, 'User not in whitelist')
                await utils.flowDynamic(`⚠️ User ${userIdentifier} was not in the whitelist.`)
            }
        } catch (error: any) {
            flowLogger.error({ err: error, userInput }, 'Failed to remove user')
            await utils.flowDynamic(`❌ Failed to remove user: ${error.message}`)
        }
    })

export const listWhitelistFlow = addKeyword<TelegramProvider, Database>(['list whitelist', '/list whitelist'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) return

        try {
            const groups = await whitelistService.getAllGroups()
            const numbers = await whitelistService.getAllNumbers()

            flowLogger.info({ groupCount: groups.length, numberCount: numbers.length }, 'Whitelist requested')

            let message = '📋 *Whitelist Status*\n\n'

            message += `*Groups (${groups.length}):*\n`
            if (groups.length === 0) {
                message += 'No whitelisted groups\n'
            } else {
                groups.forEach((g, i) => {
                    message += `${i + 1}. ${g.group_id}\n`
                })
            }

            message += `\n*Users (${numbers.length}):*\n`
            if (numbers.length === 0) {
                message += 'No whitelisted users\n'
            } else {
                numbers.forEach((n, i) => {
                    message += `${i + 1}. ${n.user_identifier}\n`
                })
            }

            await utils.flowDynamic(message)
        } catch (error) {
            flowLogger.error({ err: error }, 'Failed to retrieve whitelist')
            await utils.flowDynamic('❌ Failed to retrieve whitelist. Please try again.')
        }
    })
