/**
 * Button Example Flow
 *
 * Comprehensive demonstration of Telegram button functionality.
 * Shows how to use inline keyboards, reply keyboards, callback handling, and button editing.
 *
 * Trigger: /buttons
 */

import { addKeyword, EVENTS } from '@builderbot/bot'
import { sendWithInlineButtons, sendWithReplyButtons, editButtonsOnly } from '~/utils/flowHelpers'
import {
    createCallbackButton,
    createUrlButton,
    createCopyTextButton,
    createWebAppButton,
    createYesNoKeyboard,
    createConfirmKeyboard,
    createBackButton,
    createTextButton,
    createContactButton,
    createLocationButton,
} from '~/utils/telegramButtons'
import { createFlowLogger } from '~/utils/logger'

const logger = createFlowLogger('button-example-flow')

// ============================================================================
// Main Menu Flow
// ============================================================================

export const buttonExampleFlow = addKeyword<any, any>(['/buttons', 'buttons'])
    .addAnswer('🎮 *Button Examples*\n\nThis flow demonstrates all button types and patterns.', {
        delay: 100,
    })
    .addAction(async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '📋 <b>Choose a category to explore:</b>',
            [
                [createCallbackButton('📱 Inline Keyboards', 'demo_inline')],
                [createCallbackButton('⌨️ Reply Keyboards', 'demo_reply')],
                [createCallbackButton('🔄 Dynamic Buttons', 'demo_dynamic')],
                [createCallbackButton('✅ Confirmations', 'demo_confirm')],
                [createCallbackButton('🔗 URL & Special', 'demo_special')],
            ],
            { parseMode: 'HTML' }
        )
    })

// ============================================================================
// Inline Keyboard Demo
// ============================================================================

export const inlineKeyboardDemoFlow = addKeyword<any, any>('BUTTON_DEMO_INLINE').addAction(
    async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '📱 <b>Inline Keyboard Demo</b>\n\n' +
                'Inline keyboards appear directly below messages. ' +
                'They stay with the message and can trigger callbacks.\n\n' +
                'Try clicking the buttons below:',
            [
                [
                    createCallbackButton('Option 1', 'option_1'),
                    createCallbackButton('Option 2', 'option_2'),
                    createCallbackButton('Option 3', 'option_3'),
                ],
                [
                    createCallbackButton('👍 Like', 'action_like'),
                    createCallbackButton('❤️ Love', 'action_love'),
                    createCallbackButton('😂 Laugh', 'action_laugh'),
                ],
                ...createBackButton('demo_back'),
            ],
            { parseMode: 'HTML' }
        )
    }
)

// ============================================================================
// Reply Keyboard Demo
// ============================================================================

export const replyKeyboardDemoFlow = addKeyword<any, any>('BUTTON_DEMO_REPLY').addAction(
    async (ctx, { flowDynamic }) => {
        await sendWithReplyButtons(
            ctx,
            { flowDynamic } as any,
            '⌨️ <b>Reply Keyboard Demo</b>\n\n' +
                'Reply keyboards replace the regular keyboard. ' +
                'When you tap a button, it sends that text as a message.\n\n' +
                'The keyboard will disappear after you make a selection:',
            [
                [createTextButton('🏠 Main Menu'), createTextButton('⚙️ Settings')],
                [createTextButton('ℹ️ Help'), createTextButton('📊 Stats')],
                [createContactButton('📱 Share Contact'), createLocationButton('📍 Share Location')],
            ],
            {
                oneTime: true, // Keyboard disappears after use
                resize: true, // Adjust keyboard size
                parseMode: 'HTML',
            }
        )

        logger.info({ chatId: ctx.from }, 'Sent reply keyboard demo')
    }
)

// ============================================================================
// Dynamic Button Demo (Button Editing)
// ============================================================================

export const dynamicButtonDemoFlow = addKeyword<any, any>('BUTTON_DEMO_DYNAMIC').addAction(
    async (ctx, { flowDynamic, provider }) => {
        // Send initial message with counter buttons
        const sentMessage = await provider.vendor.telegram.sendMessage(
            ctx.from,
            '🔄 <b>Dynamic Button Demo</b>\n\n' +
                'Click the buttons below to see them update in real-time!\n\n' +
                'Counter: <code>0</code>',
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕ Increment', callback_data: 'counter_inc:0' },
                            { text: '➖ Decrement', callback_data: 'counter_dec:0' },
                        ],
                        [{ text: '🔄 Reset', callback_data: 'counter_reset:0' }],
                        [{ text: '← Back', callback_data: 'demo_back' }],
                    ],
                },
            }
        )

        logger.info({ chatId: ctx.from, messageId: sentMessage.message_id }, 'Sent dynamic button demo')
    }
)

// Counter button handlers
export const counterIncrementFlow = addKeyword<any, any>('BUTTON_COUNTER_INC').addAction(
    async (ctx, { provider }) => {
        const callbackQuery = (ctx as any)._callback_query
        if (!callbackQuery?.message) return

        const currentValue = parseInt((ctx as any)._button_data || '0', 10)
        const newValue = currentValue + 1

        await provider.vendor.telegram.editMessageText(
            callbackQuery.message.chat.id,
            callbackQuery.message.message_id,
            undefined,
            `🔄 <b>Dynamic Button Demo</b>\n\n` +
                `Click the buttons below to see them update in real-time!\n\n` +
                `Counter: <code>${newValue}</code>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕ Increment', callback_data: `counter_inc:${newValue}` },
                            { text: '➖ Decrement', callback_data: `counter_dec:${newValue}` },
                        ],
                        [{ text: '🔄 Reset', callback_data: 'counter_reset:0' }],
                        [{ text: '← Back', callback_data: 'demo_back' }],
                    ],
                },
            }
        )
    }
)

export const counterDecrementFlow = addKeyword<any, any>('BUTTON_COUNTER_DEC').addAction(
    async (ctx, { provider }) => {
        const callbackQuery = (ctx as any)._callback_query
        if (!callbackQuery?.message) return

        const currentValue = parseInt((ctx as any)._button_data || '0', 10)
        const newValue = currentValue - 1

        await provider.vendor.telegram.editMessageText(
            callbackQuery.message.chat.id,
            callbackQuery.message.message_id,
            undefined,
            `🔄 <b>Dynamic Button Demo</b>\n\n` +
                `Click the buttons below to see them update in real-time!\n\n` +
                `Counter: <code>${newValue}</code>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕ Increment', callback_data: `counter_inc:${newValue}` },
                            { text: '➖ Decrement', callback_data: `counter_dec:${newValue}` },
                        ],
                        [{ text: '🔄 Reset', callback_data: 'counter_reset:0' }],
                        [{ text: '← Back', callback_data: 'demo_back' }],
                    ],
                },
            }
        )
    }
)

export const counterResetFlow = addKeyword<any, any>('BUTTON_COUNTER_RESET').addAction(
    async (ctx, { provider }) => {
        const callbackQuery = (ctx as any)._callback_query
        if (!callbackQuery?.message) return

        await provider.vendor.telegram.editMessageText(
            callbackQuery.message.chat.id,
            callbackQuery.message.message_id,
            undefined,
            `🔄 <b>Dynamic Button Demo</b>\n\n` +
                `Click the buttons below to see them update in real-time!\n\n` +
                `Counter: <code>0</code>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '➕ Increment', callback_data: 'counter_inc:0' },
                            { text: '➖ Decrement', callback_data: 'counter_dec:0' },
                        ],
                        [{ text: '🔄 Reset', callback_data: 'counter_reset:0' }],
                        [{ text: '← Back', callback_data: 'demo_back' }],
                    ],
                },
            }
        )
    }
)

// ============================================================================
// Confirmation Demo
// ============================================================================

export const confirmationDemoFlow = addKeyword<any, any>('BUTTON_DEMO_CONFIRM').addAction(
    async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '✅ <b>Confirmation Demo</b>\n\n' +
                'Buttons are great for confirmations. This prevents accidental actions.\n\n' +
                'Try the examples below:',
            [
                [createCallbackButton('🗑️ Delete Something', 'confirm_delete')],
                [createCallbackButton('🔄 Reset Settings', 'confirm_reset')],
                [createCallbackButton('🚀 Deploy to Production', 'confirm_deploy')],
                ...createBackButton('demo_back'),
            ],
            { parseMode: 'HTML' }
        )
    }
)

// Confirmation handlers
export const confirmDeleteFlow = addKeyword<any, any>('BUTTON_CONFIRM_DELETE').addAction(
    async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '⚠️ <b>Confirm Deletion</b>\n\n' +
                'Are you sure you want to delete this item?\n' +
                'This action cannot be undone!',
            createConfirmKeyboard('Deletion', 'delete_yes', 'delete_no'),
            { parseMode: 'HTML' }
        )
    }
)

export const confirmDeleteYesFlow = addKeyword<any, any>('BUTTON_DELETE_YES').addAction(
    async (ctx, { flowDynamic }) => {
        await flowDynamic('✅ *Deleted successfully!*\n\nThe item has been removed.')
    }
)

export const confirmDeleteNoFlow = addKeyword<any, any>('BUTTON_DELETE_NO').addAction(
    async (ctx, { flowDynamic }) => {
        await flowDynamic('❌ *Deletion cancelled*\n\nNo changes were made.')
    }
)

// ============================================================================
// Special Buttons Demo (URL, Copy Text, etc.)
// ============================================================================

export const specialButtonsDemoFlow = addKeyword<any, any>('BUTTON_DEMO_SPECIAL').addAction(
    async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '🔗 <b>Special Buttons Demo</b>\n\n' +
                'Telegram supports various special button types:\n\n' +
                '• URL buttons open links\n' +
                '• Copy buttons copy text to clipboard\n' +
                '• Web App buttons launch mini apps\n\n' +
                'Try them below:',
            [
                [createUrlButton('🌐 Open Telegram', 'https://telegram.org')],
                [
                    createUrlButton('📚 BuilderBot Docs', 'https://builderbot.vercel.app'),
                    createUrlButton('🤖 Telegraf Docs', 'https://telegraf.js.org'),
                ],
                [createCopyTextButton('📋 Copy Bot Token', 'YOUR_BOT_TOKEN_HERE')],
                [createCopyTextButton('📋 Copy Account ID', 'ACC_123456789')],
                ...createBackButton('demo_back'),
            ],
            { parseMode: 'HTML' }
        )
    }
)

// ============================================================================
// Back Button Handler
// ============================================================================

export const demoBackFlow = addKeyword<any, any>('BUTTON_DEMO_BACK').addAction(
    async (ctx, { flowDynamic }) => {
        await sendWithInlineButtons(
            ctx,
            { flowDynamic } as any,
            '📋 <b>Choose a category to explore:</b>',
            [
                [createCallbackButton('📱 Inline Keyboards', 'demo_inline')],
                [createCallbackButton('⌨️ Reply Keyboards', 'demo_reply')],
                [createCallbackButton('🔄 Dynamic Buttons', 'demo_dynamic')],
                [createCallbackButton('✅ Confirmations', 'demo_confirm')],
                [createCallbackButton('🔗 URL & Special', 'demo_special')],
            ],
            { parseMode: 'HTML' }
        )
    }
)

// ============================================================================
// Option Handlers (for inline keyboard demo)
// ============================================================================

export const optionHandlerFlow = addKeyword<any, any>([
    'BUTTON_OPTION_1',
    'BUTTON_OPTION_2',
    'BUTTON_OPTION_3',
]).addAction(async (ctx, { flowDynamic }) => {
    // Extract option number from event name (BUTTON_OPTION_1 -> 1)
    const option = ctx.body.split('_').pop()
    await flowDynamic(`✅ You selected *Option ${option}*`)
})

export const actionHandlerFlow = addKeyword<any, any>([
    'BUTTON_ACTION_LIKE',
    'BUTTON_ACTION_LOVE',
    'BUTTON_ACTION_LAUGH',
]).addAction(async (ctx, { flowDynamic }) => {
    // Extract action from event name (BUTTON_ACTION_LIKE -> like)
    const action = ctx.body.split('_').pop()?.toLowerCase()
    const emoji = action === 'like' ? '👍' : action === 'love' ? '❤️' : '😂'
    await flowDynamic(`${emoji} You reacted with *${action}*!`)
})
