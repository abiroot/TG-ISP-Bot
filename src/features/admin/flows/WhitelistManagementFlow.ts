/**
 * Whitelist Management Flow (v2)
 *
 * Consolidates 5 flows into 1:
 * - whitelistGroupFlow
 * - whitelistUserFlow
 * - removeGroupFlow
 * - removeUserFlow
 * - listWhitelistFlow
 *
 * Uses state machine pattern for sub-actions
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { createFlowLogger } from '~/core/utils/logger'
import { normalizeGroupId } from '~/core/utils/contextId'

const flowLogger = createFlowLogger('whitelist-mgmt')

/**
 * Whitelist Management Flow - Single flow with sub-actions
 */
export const whitelistManagementFlow = addKeyword<TelegramProvider, Database>([
    'whitelist',
    '/whitelist',
    'remove whitelist',
    '/remove',
    'list whitelist',
    '/list whitelist',
])
    .addAction(async (ctx, { flowDynamic, state, fallBack, extensions }) => {
        const { userManagementService } = extensions!

        flowLogger.info({ from: ctx.from, body: ctx.body }, 'Whitelist management triggered')

        // Check admin
        if (!userManagementService.isAdmin(ctx.from)) {
            await flowDynamic('⚠️ This command is only available to administrators.')
            return
        }

        const input = ctx.body.toLowerCase()

        // Route to appropriate sub-action
        if (input.includes('list')) {
            return handleListWhitelist(ctx, flowDynamic, userManagementService)
        } else if (input.includes('remove')) {
            await state.update({ action: 'remove' })
            await flowDynamic('🗑️ **Remove from Whitelist**\n\nReply with:\n• "group" to remove current group\n• Phone number to remove user (e.g., +1234567890)')
            return
        } else {
            await state.update({ action: 'add' })
            await flowDynamic('➕ **Add to Whitelist**\n\nReply with:\n• "group" to whitelist current group\n• Phone number to whitelist user (e.g., +1234567890)')
            return
        }
    })
    .addAnswer(
        '⏱️ _Waiting for your choice..._',
        { capture: true },
        async (ctx, { flowDynamic, state, endFlow, extensions }) => {
            const { userManagementService } = extensions!
            const action = await state.get<'add' | 'remove'>('action')
            const input = ctx.body.trim()

            if (input.toLowerCase() === 'group') {
                // Handle group
                const groupId = normalizeGroupId(ctx.from)

                if (action === 'add') {
                    await userManagementService.whitelistGroup(groupId, ctx.from, 'Added via bot')
                    await flowDynamic(`✅ Group ${groupId} has been whitelisted!`)
                } else {
                    await userManagementService.removeGroupFromWhitelist(groupId)
                    await flowDynamic(`✅ Group ${groupId} has been removed from whitelist!`)
                }
            } else if (input.match(/^\+?\d{6,15}$/)) {
                // Handle phone number
                if (action === 'add') {
                    await userManagementService.whitelistUser(input, ctx.from, 'Added via bot')
                    await flowDynamic(`✅ User ${input} has been whitelisted!`)
                } else {
                    await userManagementService.removeUserFromWhitelist(input)
                    await flowDynamic(`✅ User ${input} has been removed from whitelist!`)
                }
            } else {
                await flowDynamic('❌ Invalid input. Please provide "group" or a phone number.')
                return
            }

            await state.clear()
            return endFlow()
        }
    )

/**
 * Handle list whitelist sub-action
 */
async function handleListWhitelist(ctx: any, flowDynamic: any, userManagementService: any) {
    const [groups, users] = await Promise.all([
        userManagementService.getWhitelistedGroups(),
        userManagementService.getWhitelistedUsers(),
    ])

    let message = '📋 **Whitelist Overview**\n\n'

    if (groups.length > 0) {
        message += `**Groups (${groups.length}):**\n`
        groups.slice(0, 10).forEach((g: any) => {
            message += `• ${g.group_id}\n`
        })
        if (groups.length > 10) {
            message += `_...and ${groups.length - 10} more_\n`
        }
        message += '\n'
    } else {
        message += '**Groups:** None\n\n'
    }

    if (users.length > 0) {
        message += `**Users (${users.length}):**\n`
        users.slice(0, 10).forEach((u: any) => {
            message += `• ${u.user_identifier}\n`
        })
        if (users.length > 10) {
            message += `_...and ${users.length - 10} more_\n`
        }
    } else {
        message += '**Users:** None'
    }

    await flowDynamic(message)
}

/**
 * Flow metadata for registry
 */
