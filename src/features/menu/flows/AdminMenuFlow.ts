/**
 * Admin Menu Flows
 *
 * Complete admin control panel with submenus for:
 * - Whitelist management
 * - Bot status and feature toggles
 * - Role management
 * - User listing
 * - Unfulfilled locations
 */

import { addKeyword } from '@builderbot/bot'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { runAdminMiddleware } from '~/core/middleware/adminMiddleware'

const flowLogger = createFlowLogger('admin-menu')

/**
 * Whitelist Management Submenu
 * Provides access to whitelist CRUD operations
 */
export const adminWhitelistFlow = addKeyword<TelegramProvider, Database>('BUTTON_ADMIN_WHITELIST')
    .addAction(async (ctx, utils) => {
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        flowLogger.info({ from: ctx.from }, 'Whitelist management menu opened')

        await sendWithInlineButtons(
            ctx,
            utils,
            '👥 <b>Whitelist Management</b>\n\n' +
                '<b>Available Actions:</b>\n' +
                '• Add groups or users to whitelist\n' +
                '• Remove from whitelist\n' +
                '• View all whitelisted items',
            [
                [createCallbackButton('➕ Add to Whitelist', 'cmd_whitelist')],
                [createCallbackButton('➖ Remove from Whitelist', 'cmd_remove_whitelist')],
                [createCallbackButton('📋 List Whitelist', 'cmd_list_whitelist')],
                [createCallbackButton('← Back to Admin', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Bot Status & Control Submenu
 * Shows current bot status and provides feature toggles
 */
export const adminBotFlow = addKeyword<TelegramProvider, Database>('BUTTON_ADMIN_BOT').addAction(
    async (ctx, utils) => {
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        const { botStateService } = utils.extensions!
        const state = await botStateService.getFullState()

        flowLogger.info({ from: ctx.from }, 'Bot control panel opened')

        const statusMessage =
            '🤖 <b>Bot Control Panel</b>\n\n' +
            '<b>Current Status:</b>\n' +
            `• Maintenance: ${state.maintenance.enabled ? '🔧 ON' : '✅ OFF'}\n` +
            `• AI Responses: ${state.features.ai_responses ? '✅ ON' : '❌ OFF'}\n` +
            `• Voice Notes: ${state.features.voice_transcription ? '✅ ON' : '❌ OFF'}\n` +
            `• Image Analysis: ${state.features.image_analysis ? '✅ ON' : '❌ OFF'}\n` +
            `• ISP Tools: ${state.features.isp_tools ? '✅ ON' : '❌ OFF'}`

        await sendWithInlineButtons(
            ctx,
            utils,
            statusMessage,
            [
                [createCallbackButton('📊 View Full Status', 'cmd_bot_status')],
                [
                    createCallbackButton(
                        state.maintenance.enabled ? '✅ Disable Maintenance' : '🔧 Enable Maintenance',
                        'cmd_toggle_maintenance'
                    ),
                ],
                [createCallbackButton('🤖 Toggle AI', 'cmd_toggle_ai')],
                [
                    createCallbackButton('🎤 Toggle Voice', 'cmd_toggle_voice'),
                    createCallbackButton('🖼️ Toggle Media', 'cmd_toggle_media'),
                ],
                [createCallbackButton('🔧 Toggle ISP', 'cmd_toggle_isp')],
                [createCallbackButton('← Back to Admin', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    }
)

/**
 * Role Management Submenu
 * Provides access to role CRUD operations
 */
export const adminRolesFlow = addKeyword<TelegramProvider, Database>('BUTTON_ADMIN_ROLES').addAction(
    async (ctx, utils) => {
        const adminCheck = await runAdminMiddleware(ctx, utils)
        if (!adminCheck.allowed) return

        flowLogger.info({ from: ctx.from }, 'Role management menu opened')

        await sendWithInlineButtons(
            ctx,
            utils,
            '🛡️ <b>Role Management</b>\n\n' +
                '<b>Available Actions:</b>\n' +
                '• List all user roles\n' +
                '• Show specific user role\n' +
                '• Add/Set/Remove roles\n\n' +
                '<i>Note: Commands require user ID input</i>',
            [
                [createCallbackButton('📋 List All Roles', 'cmd_list_roles')],
                [createCallbackButton('👤 Show User Role', 'cmd_show_role')],
                [createCallbackButton('➕ Add Role', 'cmd_add_role')],
                [createCallbackButton('✏️ Set Role', 'cmd_set_role')],
                [createCallbackButton('➖ Remove Role', 'cmd_remove_role')],
                [createCallbackButton('← Back to Admin', 'menu_back')],
            ],
            { parseMode: 'HTML' }
        )
    }
)

/**
 * User Listing - Direct command execution
 */
export const adminUsersFlow = addKeyword<TelegramProvider, Database>('BUTTON_ADMIN_USERS').addAction(
    async (ctx, { gotoFlow }) => {
        // Import the flow here to avoid circular dependency
        const { userListingFlow } = await import('../../admin/flows/UserListingFlow.js')
        return gotoFlow(userListingFlow)
    }
)

/**
 * Unfulfilled Locations - Direct command execution
 */
export const adminLocationsFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_ADMIN_LOCATIONS'
).addAction(async (ctx, { gotoFlow }) => {
    // Import the flow here to avoid circular dependency
    const { unfulfilledLocationsFlow } = await import(
        '../../admin/flows/UnfulfilledLocationsFlow.js'
    )
    return gotoFlow(unfulfilledLocationsFlow)
})

// ============================================================================
// COMMAND EXECUTION FLOWS - Route buttons to existing command flows
// ============================================================================

/**
 * Whitelist Command Buttons
 * Routes to consolidated whitelistManagementFlow with appropriate body text
 */
export const cmdWhitelistFlow = addKeyword<TelegramProvider, Database>('BUTTON_CMD_WHITELIST')
    .addAction(async (ctx, { flowDynamic }) => {
        // Redirect user to use text command (consolidated flow requires text input)
        await flowDynamic(
            '➕ <b>Add to Whitelist</b>\n\n' +
                'To add to whitelist, use:\n' +
                '• <code>whitelist group</code> - Whitelist current group\n' +
                '• <code>whitelist [user_id]</code> - Whitelist a user\n\n' +
                '<i>Example: whitelist 123456789</i>'
        )
    })

export const cmdRemoveWhitelistFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_REMOVE_WHITELIST'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic(
        '➖ <b>Remove from Whitelist</b>\n\n' +
            'To remove from whitelist, use:\n' +
            '• <code>remove group</code> - Remove current group\n' +
            '• <code>remove [user_id]</code> - Remove a user\n\n' +
            '<i>Example: remove 123456789</i>'
    )
})

export const cmdListWhitelistFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_LIST_WHITELIST'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('📋 <b>List Whitelist</b>\n\n' + 'Use: <code>list whitelist</code>')
})

/**
 * Bot Status Command Button
 * Routes to consolidated botManagementFlow with 'bot status' trigger
 */
export const cmdBotStatusFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_BOT_STATUS'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('📊 <b>Bot Status</b>\n\n' + 'Use: <code>bot status</code>')
})

/**
 * Maintenance Toggle - With Confirmation
 */
export const cmdToggleMaintenanceFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_TOGGLE_MAINTENANCE'
).addAction(async (ctx, utils) => {
    const adminCheck = await runAdminMiddleware(ctx, utils)
    if (!adminCheck.allowed) return

    const { botStateService } = utils.extensions!
    const state = await botStateService.getFullState()
    const isEnabled = state.maintenance.enabled

    flowLogger.info({ from: ctx.from, currentState: isEnabled }, 'Maintenance toggle requested')

    // Show confirmation dialog
    await sendWithInlineButtons(
        ctx,
        utils,
        `⚠️ <b>Confirm Action</b>\n\n` +
            `Are you sure you want to <b>${isEnabled ? 'DISABLE' : 'ENABLE'}</b> maintenance mode?\n\n` +
            `${isEnabled ? 'Users will be able to use the bot again.' : 'Only admins will be able to use the bot.'}`,
        [
            [createCallbackButton('✅ Confirm', 'confirm_toggle_maintenance')],
            [createCallbackButton('❌ Cancel', 'admin_bot')],
        ],
        { parseMode: 'HTML' }
    )
})

/**
 * Confirm Maintenance Toggle
 */
export const confirmToggleMaintenanceFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CONFIRM_TOGGLE_MAINTENANCE'
).addAction(async (ctx, { flowDynamic }) => {
    const { botStateService } = ctx.extensions!
    const state = await botStateService.getFullState()

    await flowDynamic(
        `🔧 <b>Toggle Maintenance</b>\n\n` +
            `Use: <code>${state.maintenance.enabled ? 'disable maintenance' : 'enable maintenance'}</code>`
    )
})

/**
 * Feature Toggle Command Buttons (Show instructions)
 */
export const cmdToggleAIFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_TOGGLE_AI'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('🤖 <b>Toggle AI</b>\n\n' + 'Use: <code>toggle ai</code>')
})

export const cmdToggleVoiceFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_TOGGLE_VOICE'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('🎤 <b>Toggle Voice</b>\n\n' + 'Use: <code>toggle voice</code>')
})

export const cmdToggleMediaFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_TOGGLE_MEDIA'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('🖼️ <b>Toggle Media</b>\n\n' + 'Use: <code>toggle media</code>')
})

export const cmdToggleISPFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_TOGGLE_ISP'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('🔧 <b>Toggle ISP</b>\n\n' + 'Use: <code>toggle isp</code>')
})

/**
 * Role Management Command Buttons
 */
export const cmdListRolesFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_LIST_ROLES'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic('📋 <b>List All Roles</b>\n\n' + 'Use: <code>/list roles</code>')
})

export const cmdShowRoleFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_SHOW_ROLE'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic(
        '👤 <b>Show User Role</b>\n\n' +
            'Use: <code>/show role [user_id]</code>\n\n' +
            '<i>Example: /show role 123456789</i>'
    )
})

export const cmdAddRoleFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_ADD_ROLE'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic(
        '➕ <b>Add Role</b>\n\n' +
            'Use: <code>/add role [user_id] [role]</code>\n\n' +
            '<i>Example: /add role 123456789 admin</i>'
    )
})

export const cmdSetRoleFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_SET_ROLE'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic(
        '✏️ <b>Set Role</b>\n\n' +
            'Use: <code>/set role [user_id] [role]</code>\n\n' +
            '<i>Example: /set role 123456789 admin</i>'
    )
})

export const cmdRemoveRoleFlow = addKeyword<TelegramProvider, Database>(
    'BUTTON_CMD_REMOVE_ROLE'
).addAction(async (ctx, { flowDynamic }) => {
    await flowDynamic(
        '➖ <b>Remove Role</b>\n\n' +
            'Use: <code>/remove role [user_id] [role]</code>\n\n' +
            '<i>Example: /remove role 123456789 admin</i>'
    )
})
