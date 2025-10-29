import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { runAdminMiddleware } from '~/middleware/pipeline'
import { whitelistService } from '~/services/whitelistService'
import { personalityService } from '~/services/personalityService'
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

export const whitelistUserFlow = addKeyword<TelegramProvider, Database>(
    ['whitelist user', '/whitelist user', 'wl user', 'wl u'],
    {
        sensitive: false,
    }
)
    .addAction(async (ctx, utils) => {
        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) {
            // End the flow completely if not admin
            return utils.endFlow()
        }

        // Check if user identifier is provided inline (e.g., "/wl user @username" or "/wl user 2021834510")
        const message = ctx.body.trim()
        const parts = message.split(/\s+/)

        // If there are more than 2 parts, likely has inline user identifier
        // Examples: "wl user @username", "/wl user 2021834510", "wl user username"
        if (parts.length > 2) {
            // Extract everything after the command as potential user identifier
            const potentialUser = parts.slice(2).join('')

            // Validate and format the user identifier
            let userIdentifier = potentialUser

            // Remove @ prefix if present (for consistency)
            if (userIdentifier.startsWith('@')) {
                userIdentifier = userIdentifier.substring(1)
            }

            // Validate that it's either a username (letters/underscores) or numeric ID
            const isValidUsername = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(userIdentifier)
            const isValidNumericId = /^\d+$/.test(userIdentifier)

            if (!isValidUsername && !isValidNumericId) {
                await utils.flowDynamic(
                    `⚠️ Invalid user identifier: "${potentialUser}"\n\nPlease provide a valid Telegram username (e.g., @username) or numeric user ID (e.g., 2021834510)`
                )
                return utils.endFlow()
            }

            try {
                await whitelistService.whitelistUser(userIdentifier, ctx.from)
                flowLogger.info({ userIdentifier, addedBy: ctx.from }, 'User whitelisted (inline)')
                await utils.flowDynamic(`✅ User ${userIdentifier} has been whitelisted!`)
                return utils.endFlow() // Exit early, don't prompt for user
            } catch (error: any) {
                flowLogger.error({ err: error, userIdentifier }, 'Failed to whitelist user (inline)')
                await utils.flowDynamic(
                    `❌ Failed to whitelist user: ${error.message}\n\nPlease provide a valid Telegram username or numeric user ID`
                )
                return utils.endFlow()
            }
        }

        // No inline user provided, prompt for it
        await utils.flowDynamic(
            'Please send the user to whitelist: Telegram username (e.g., @username) or numeric user ID (e.g., 2021834510)'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        // Double-check admin status in capture step as safety measure
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) {
            return utils.endFlow()
        }

        const userInput = ctx.body.trim()

        // Validate and format the user identifier
        let userIdentifier = userInput

        // Remove @ prefix if present (for consistency)
        if (userIdentifier.startsWith('@')) {
            userIdentifier = userIdentifier.substring(1)
        }

        // Validate that it's either a username (letters/underscores) or numeric ID
        const isValidUsername = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(userIdentifier)
        const isValidNumericId = /^\d+$/.test(userIdentifier)

        if (!isValidUsername && !isValidNumericId) {
            await utils.flowDynamic(
                `⚠️ Invalid user identifier: "${userInput}"\n\nPlease provide a valid Telegram username (e.g., @username) or numeric user ID (e.g., 2021834510)`
            )
            return
        }

        try {
            await whitelistService.whitelistUser(userIdentifier, ctx.from)
            flowLogger.info({ userIdentifier, addedBy: ctx.from }, 'User whitelisted')
            await utils.flowDynamic(`✅ User ${userIdentifier} has been whitelisted!`)
        } catch (error: any) {
            flowLogger.error({ err: error, userIdentifier }, 'Failed to whitelist user')
            await utils.flowDynamic(
                `❌ Failed to whitelist user: ${error.message}\n\nPlease provide a valid Telegram username or numeric user ID`
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

export const removeUserFlow = addKeyword<TelegramProvider, Database>(['remove user', '/remove user', 'rm user', 'rm u'])
    .addAction(async (ctx, utils) => {
        // Check if user is admin using centralized middleware
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) {
            return utils.endFlow()
        }

        await utils.flowDynamic(
            'Please send the user to remove: Telegram username (e.g., @username) or numeric user ID (e.g., 2021834510)'
        )
    })
    .addAnswer('', { capture: true }, async (ctx, utils) => {
        // Double-check admin status in capture step as safety measure
        const middlewareResult = await runAdminMiddleware(ctx, utils)
        if (!middlewareResult.allowed) {
            return utils.endFlow()
        }

        const userInput = ctx.body.trim()

        // Validate and format the user identifier
        let userIdentifier = userInput

        // Remove @ prefix if present (for consistency)
        if (userIdentifier.startsWith('@')) {
            userIdentifier = userIdentifier.substring(1)
        }

        // Validate that it's either a username (letters/underscores) or numeric ID
        const isValidUsername = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(userIdentifier)
        const isValidNumericId = /^\d+$/.test(userIdentifier)

        if (!isValidUsername && !isValidNumericId) {
            await utils.flowDynamic(
                `⚠️ Invalid user identifier: "${userInput}"\n\nPlease provide a valid Telegram username (e.g., @username) or numeric user ID (e.g., 2021834510)`
            )
            return
        }

        try {
            const removed = await whitelistService.removeUser(userIdentifier)
            if (removed) {
                flowLogger.info({ userIdentifier, removedBy: ctx.from }, 'User removed from whitelist')
                await utils.flowDynamic(`✅ User ${userIdentifier} has been removed from the whitelist.`)
            } else {
                flowLogger.warn({ userIdentifier }, 'User not in whitelist')
                await utils.flowDynamic(`⚠️ User ${userIdentifier} was not in the whitelist.`)
            }
        } catch (error: any) {
            flowLogger.error({ err: error, userIdentifier }, 'Failed to remove user')
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
            const users = await whitelistService.getAllUsers()

            flowLogger.info({ groupCount: groups.length, userCount: users.length }, 'Whitelist requested')

            let message = '📋 *Whitelist Status*\n\n'

            message += `*Groups (${groups.length}):*\n`
            if (groups.length === 0) {
                message += 'No whitelisted groups\n'
            } else {
                groups.forEach((g, i) => {
                    message += `${i + 1}. ${g.group_id}\n`
                })
            }

            message += `\n*Users (${users.length}):*\n`
            if (users.length === 0) {
                message += 'No whitelisted users\n'
            } else {
                users.forEach((u, i) => {
                    message += `${i + 1}. ${u.user_identifier}\n`
                })
            }

            await utils.flowDynamic(message)
        } catch (error) {
            flowLogger.error({ err: error }, 'Failed to retrieve whitelist')
            await utils.flowDynamic('❌ Failed to retrieve whitelist. Please try again.')
        }
    })
