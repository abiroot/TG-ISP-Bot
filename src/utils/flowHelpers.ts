import type { BotMethods } from '@builderbot/bot/dist/types'
import { Markup } from 'telegraf'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import { MessageLogger } from '~/middleware/messageLogger'
import { createFlowLogger } from '~/utils/logger'
import {
    createInlineKeyboard,
    createReplyKeyboard,
    type InlineKeyboard,
    type ReplyKeyboard,
} from '~/utils/telegramButtons'

const logger = createFlowLogger('flow-helpers')

export interface MessageOptions {
    media?: string
    metadata?: Record<string, any>
}

/**
 * Helper to send a message and log it automatically
 *
 * This helper eliminates the need for try-catch blocks around message logging
 * in flows, providing a consistent pattern for sending and logging messages.
 *
 * @param ctx - Bot context
 * @param utils - Bot utils
 * @param message - Message(s) to send
 * @param options - Optional media and metadata
 *
 * @example
 * ```ts
 * // Simple message
 * await sendAndLog(ctx, utils, 'Hello!')
 *
 * // Multiple messages
 * await sendAndLog(ctx, utils, ['Hello!', 'How are you?'])
 *
 * // With metadata
 * await sendAndLog(ctx, utils, 'User found', {
 *     metadata: { method: 'getUserInfo', userId: 123 }
 * })
 *
 * // With media
 * await sendAndLog(ctx, utils, 'Check this image', {
 *     media: 'https://example.com/image.png'
 * })
 * ```
 */
export async function sendAndLog(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string | string[],
    options?: MessageOptions
): Promise<void> {
    try {
        // Send the message
        if (options?.media) {
            await utils.flowDynamic([{ body: Array.isArray(message) ? message.join('\n') : message, media: options.media }])
        } else {
            await utils.flowDynamic(message)
        }

        // Log each message
        const messages = Array.isArray(message) ? message : [message]
        for (const msg of messages) {
            await MessageLogger.logOutgoing(
                ctx.from,
                ctx.from,
                msg,
                options?.media,
                options?.metadata
            )
        }
    } catch (error) {
        logger.error({ err: error, message, options }, 'Failed to send and log message')
        throw error
    }
}

/**
 * Helper to send and log a message with error handling
 *
 * Similar to sendAndLog but catches errors and logs them instead of throwing.
 * Useful in contexts where message sending is not critical to flow execution.
 *
 * @returns true if successful, false if failed
 */
export async function trySendAndLog(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string | string[],
    options?: MessageOptions
): Promise<boolean> {
    try {
        await sendAndLog(ctx, utils, message, options)
        return true
    } catch (error) {
        logger.error({ err: error, message }, 'Failed to send and log message (non-critical)')
        return false
    }
}

/**
 * Wrapper for flowDynamic that automatically logs
 *
 * Creates a logging version of flowDynamic bound to a specific context
 *
 * @example
 * ```ts
 * const loggedFlowDynamic = createLoggingFlowDynamic(ctx, utils)
 * await loggedFlowDynamic('Hello!')
 * await loggedFlowDynamic(['Line 1', 'Line 2'])
 * ```
 */
export function createLoggingFlowDynamic(ctx: any, utils: BotMethods<any, any>) {
    return async (message: string | string[], options?: MessageOptions) => {
        await sendAndLog(ctx, utils, message, options)
    }
}

/**
 * Get context ID from context
 *
 * Helper to consistently extract context_id across the codebase
 */
export function getContextId(ctx: any): string {
    return ctx.from
}

/**
 * Format phone number for display
 *
 * Helper to consistently format phone numbers for messages
 */
export function formatPhoneNumber(phoneNumber: string): string {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '')

    // Format as +961 XX XXX XXX (Lebanese format) if it matches
    if (cleaned.length === 11 && cleaned.startsWith('961')) {
        return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`
    }

    // Format as +XXX XX XXX XXXX (international format) if it starts with country code
    if (cleaned.length >= 10) {
        return `+${cleaned}`
    }

    // Return as-is if doesn't match known formats
    return phoneNumber
}

// ============================================================================
// Button Helpers
// ============================================================================

export interface ButtonMessageOptions extends MessageOptions {
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    disableWebPagePreview?: boolean
    disableNotification?: boolean
}

/**
 * Send a message with inline keyboard buttons
 *
 * Combines message sending with inline keyboard attachment and automatic logging.
 * Use this for interactive menus, confirmations, and action buttons.
 *
 * @param ctx - Bot context
 * @param utils - Bot utils
 * @param message - Message text
 * @param buttons - Inline keyboard layout (2D array of button configs)
 * @param options - Optional message formatting options
 *
 * @example
 * ```ts
 * import { createCallbackButton, createUrlButton } from '~/utils/telegramButtons'
 *
 * // Simple yes/no confirmation
 * await sendWithInlineButtons(ctx, utils, 'Enable maintenance mode?', [
 *     [
 *         createCallbackButton('✅ Yes', 'maintenance_enable'),
 *         createCallbackButton('❌ No', 'maintenance_cancel')
 *     ]
 * ])
 *
 * // Multi-row menu with different button types
 * await sendWithInlineButtons(ctx, utils, '<b>Customer Actions:</b>', [
 *     [createCallbackButton('🔄 Refresh', 'refresh_123')],
 *     [createUrlButton('📞 Call', 'tel:+1234567890')],
 *     [createCallbackButton('← Back', 'back_menu')]
 * ], { parseMode: 'HTML' })
 * ```
 */
export async function sendWithInlineButtons(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string,
    buttons: InlineKeyboard,
    options?: ButtonMessageOptions
): Promise<void> {
    try {
        // Validate inputs
        if (!message || typeof message !== 'string') {
            throw new Error('Message text is required and must be a string')
        }

        if (message.length > 4096) {
            throw new Error(`Message text too long (${message.length} characters, max 4096)`)
        }

        if (!buttons || !Array.isArray(buttons)) {
            throw new Error('Buttons must be a 2D array of button configurations')
        }

        const provider = utils.provider as TelegramProvider

        if (!provider?.vendor?.telegram?.sendMessage) {
            throw new Error(
                'Telegram provider not available - ensure you pass the full utils object including provider. ' +
                'Use: async (ctx, { flowDynamic, provider }) => { ... } and pass utils instead of { flowDynamic } as any'
            )
        }

        // Convert and validate buttons (throws if invalid)
        const inlineKeyboard = createInlineKeyboard(buttons)

        // Build message options
        const sendOptions: any = {
            parse_mode: options?.parseMode,
            disable_web_page_preview: options?.disableWebPagePreview,
            disable_notification: options?.disableNotification,
            ...Markup.inlineKeyboard(inlineKeyboard),
        }

        // Send message with buttons via Telegraf vendor
        await provider.vendor.telegram.sendMessage(ctx.from, message, sendOptions)

        // Log outgoing message with button metadata
        await MessageLogger.logOutgoing(
            ctx.from,
            ctx.from,
            message,
            options?.media,
            {
                ...options?.metadata,
                buttons: inlineKeyboard,
                button_type: 'inline',
            }
        )

        logger.debug(
            { chatId: ctx.from, buttonCount: inlineKeyboard.flat().length },
            'Sent message with inline buttons'
        )
    } catch (error) {
        logger.error({ err: error, message, buttons }, 'Failed to send message with inline buttons')
        throw error
    }
}

/**
 * Send a message with reply keyboard buttons
 *
 * Reply keyboards replace the user's text input area with custom buttons.
 * Use sparingly as they persist until removed.
 *
 * @param ctx - Bot context
 * @param utils - Bot utils
 * @param message - Message text
 * @param buttons - Reply keyboard layout (2D array of button configs)
 * @param options - Keyboard options
 *
 * @example
 * ```ts
 * import { createTextButton, createContactButton } from '~/utils/telegramButtons'
 *
 * await sendWithReplyButtons(ctx, utils, 'Choose an option:', [
 *     [createTextButton('Main Menu'), createTextButton('Settings')],
 *     [createContactButton('📱 Share Contact')]
 * ], { oneTime: true, resize: true })
 * ```
 */
export async function sendWithReplyButtons(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string,
    buttons: ReplyKeyboard,
    options?: {
        oneTime?: boolean
        resize?: boolean
        selective?: boolean
        placeholder?: string
        persistent?: boolean
    } & ButtonMessageOptions
): Promise<void> {
    try {
        // Validate inputs
        if (!message || typeof message !== 'string') {
            throw new Error('Message text is required and must be a string')
        }

        if (message.length > 4096) {
            throw new Error(`Message text too long (${message.length} characters, max 4096)`)
        }

        if (!buttons || !Array.isArray(buttons)) {
            throw new Error('Buttons must be a 2D array of button configurations')
        }

        const provider = utils.provider as TelegramProvider

        if (!provider?.vendor?.telegram?.sendMessage) {
            throw new Error(
                'Telegram provider not available - ensure you pass the full utils object including provider. ' +
                'Use: async (ctx, { flowDynamic, provider }) => { ... } and pass utils instead of { flowDynamic } as any'
            )
        }

        // Convert and validate buttons (throws if invalid)
        const replyKeyboard = createReplyKeyboard(buttons)

        // Build keyboard markup
        let markup = Markup.keyboard(replyKeyboard)

        if (options?.oneTime) markup = markup.oneTime()
        if (options?.resize) markup = markup.resize()
        if (options?.selective) markup = markup.selective()
        if (options?.placeholder) markup = markup.placeholder(options.placeholder)
        if (options?.persistent) markup = markup.persistent()

        // Build message options
        const sendOptions: any = {
            parse_mode: options?.parseMode,
            disable_web_page_preview: options?.disableWebPagePreview,
            disable_notification: options?.disableNotification,
            ...markup,
        }

        // Send message with keyboard
        await provider.vendor.telegram.sendMessage(ctx.from, message, sendOptions)

        // Log outgoing message with keyboard metadata
        await MessageLogger.logOutgoing(
            ctx.from,
            ctx.from,
            message,
            options?.media,
            {
                ...options?.metadata,
                buttons: replyKeyboard,
                button_type: 'reply',
                keyboard_options: {
                    one_time: options?.oneTime,
                    resize: options?.resize,
                    selective: options?.selective,
                    placeholder: options?.placeholder,
                    persistent: options?.persistent,
                },
            }
        )

        logger.debug(
            { chatId: ctx.from, buttonCount: replyKeyboard.flat().length },
            'Sent message with reply keyboard'
        )
    } catch (error) {
        logger.error({ err: error, message, buttons }, 'Failed to send message with reply keyboard')
        throw error
    }
}

/**
 * Remove reply keyboard
 *
 * Removes the current reply keyboard and shows the standard text input.
 *
 * @example
 * ```ts
 * await removeReplyKeyboard(ctx, utils, 'Keyboard removed')
 * ```
 */
export async function removeReplyKeyboard(
    ctx: any,
    utils: BotMethods<any, any>,
    message?: string
): Promise<void> {
    try {
        const provider = utils.provider as TelegramProvider

        const sendOptions = {
            ...Markup.removeKeyboard(),
        }

        await provider.vendor.telegram.sendMessage(
            ctx.from,
            message || 'Keyboard removed',
            sendOptions
        )

        logger.debug({ chatId: ctx.from }, 'Removed reply keyboard')
    } catch (error) {
        logger.error({ err: error }, 'Failed to remove reply keyboard')
        throw error
    }
}

/**
 * Edit only the buttons of an existing message
 *
 * Updates the inline keyboard attached to a message without changing the text.
 * Useful for showing updated states (e.g., "Processing..." -> "✅ Completed").
 *
 * @param ctx - Bot context
 * @param utils - Bot utils
 * @param messageId - ID of the message to edit
 * @param buttons - New inline keyboard layout
 *
 * @example
 * ```ts
 * // After user clicks "Confirm", update buttons to show completed state
 * await editButtonsOnly(ctx, utils, messageId, [
 *     [createCallbackButton('✅ Confirmed', 'noop')],
 *     [createCallbackButton('← Back', 'back_menu')]
 * ])
 * ```
 */
export async function editButtonsOnly(
    ctx: any,
    utils: BotMethods<any, any>,
    messageId: number,
    buttons: InlineKeyboard
): Promise<void> {
    try {
        const provider = utils.provider as TelegramProvider
        const inlineKeyboard = createInlineKeyboard(buttons)

        await provider.vendor.telegram.editMessageReplyMarkup(
            ctx.from,
            messageId,
            undefined,
            Markup.inlineKeyboard(inlineKeyboard).reply_markup
        )

        logger.debug({ chatId: ctx.from, messageId }, 'Edited message buttons')
    } catch (error) {
        logger.error({ err: error, messageId, buttons }, 'Failed to edit message buttons')
        throw error
    }
}

/**
 * Edit message text and buttons
 *
 * Updates both the text and inline keyboard of an existing message.
 *
 * @example
 * ```ts
 * await editMessageAndButtons(ctx, utils, messageId,
 *     '✅ <b>Action completed!</b>',
 *     [[createCallbackButton('← Back', 'back')]],
 *     { parseMode: 'HTML' }
 * )
 * ```
 */
export async function editMessageAndButtons(
    ctx: any,
    utils: BotMethods<any, any>,
    messageId: number,
    newText: string,
    buttons: InlineKeyboard,
    options?: { parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2' }
): Promise<void> {
    try {
        const provider = utils.provider as TelegramProvider
        const inlineKeyboard = createInlineKeyboard(buttons)

        await provider.vendor.telegram.editMessageText(
            ctx.from,
            messageId,
            undefined,
            newText,
            {
                parse_mode: options?.parseMode,
                ...Markup.inlineKeyboard(inlineKeyboard),
            }
        )

        logger.debug({ chatId: ctx.from, messageId }, 'Edited message text and buttons')
    } catch (error) {
        logger.error(
            { err: error, messageId, newText, buttons },
            'Failed to edit message text and buttons'
        )
        throw error
    }
}

/**
 * Answer a callback query
 *
 * Responds to a button click, removing the loading state and optionally showing
 * a notification or alert to the user.
 *
 * @param callbackQueryId - The callback query ID from the button click event
 * @param utils - Bot utils
 * @param text - Optional notification text (shown at top of chat)
 * @param showAlert - If true, shows a modal alert instead of notification
 *
 * @example
 * ```ts
 * // In callback_query handler
 * await answerCallbackQuery(callbackQuery.id, utils, '✅ Action confirmed!')
 *
 * // Show alert dialog
 * await answerCallbackQuery(callbackQuery.id, utils, '⚠️ This is important!', true)
 *
 * // Just remove loading state (no notification)
 * await answerCallbackQuery(callbackQuery.id, utils)
 * ```
 */
export async function answerCallbackQuery(
    callbackQueryId: string,
    utils: BotMethods<any, any>,
    text?: string,
    showAlert = false
): Promise<void> {
    try {
        const provider = utils.provider as TelegramProvider

        await provider.vendor.telegram.answerCbQuery(callbackQueryId, text, {
            show_alert: showAlert,
        })

        logger.debug({ callbackQueryId, text, showAlert }, 'Answered callback query')
    } catch (error) {
        logger.error({ err: error, callbackQueryId }, 'Failed to answer callback query')
        // Don't throw - answering callback query is not critical
    }
}
