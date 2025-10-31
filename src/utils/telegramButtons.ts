/**
 * Telegram Button Utilities
 *
 * Type-safe wrappers around Telegraf's Markup API for creating interactive buttons.
 * Supports inline keyboards and reply keyboards with full TypeScript support.
 */

import { InlineKeyboardButton, KeyboardButton } from 'telegraf/types'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Inline keyboard button configuration
 */
export interface InlineButtonConfig {
    text: string
    data?: string                // callback_data
    url?: string                 // HTTP/HTTPS URL
    webApp?: { url: string }     // Web App URL
    loginUrl?: {                 // Telegram Login Widget
        url: string
        forwardText?: string
        botUsername?: string
        requestWriteAccess?: boolean
    }
    switchInlineQuery?: string   // Switch to inline mode
    switchInlineQueryCurrentChat?: string
    copyText?: string            // Copy text to clipboard
    callbackGame?: object        // Game callback
    pay?: boolean                // Payment button
}

/**
 * Reply keyboard button configuration
 */
export interface ReplyButtonConfig {
    text: string
    requestContact?: boolean
    requestLocation?: boolean
    requestPoll?: {
        type?: 'quiz' | 'regular'
    }
    webApp?: { url: string }
}

/**
 * Inline keyboard layout (2D array of buttons)
 */
export type InlineKeyboard = InlineButtonConfig[][]

/**
 * Reply keyboard layout (2D array of buttons)
 */
export type ReplyKeyboard = ReplyButtonConfig[][]

// ============================================================================
// Button Builders
// ============================================================================

/**
 * Create an inline keyboard button with callback data
 *
 * @example
 * createCallbackButton('Confirm', 'action_confirm')
 */
export function createCallbackButton(text: string, callbackData: string): InlineButtonConfig {
    if (callbackData.length > 64) {
        throw new Error('Callback data must be 64 bytes or less')
    }
    return { text, data: callbackData }
}

/**
 * Create an inline keyboard button that opens a URL
 *
 * @example
 * createUrlButton('Visit Website', 'https://example.com')
 */
export function createUrlButton(text: string, url: string): InlineButtonConfig {
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('tg://')) {
        throw new Error('URL must start with http://, https://, or tg://')
    }
    return { text, url }
}

/**
 * Create an inline keyboard button that launches a Web App
 *
 * @example
 * createWebAppButton('Open App', 'https://app.example.com')
 */
export function createWebAppButton(text: string, webAppUrl: string): InlineButtonConfig {
    if (!webAppUrl.startsWith('https://')) {
        throw new Error('Web App URL must start with https://')
    }
    return { text, webApp: { url: webAppUrl } }
}

/**
 * Create an inline keyboard button that copies text to clipboard
 *
 * @example
 * createCopyTextButton('Copy Account ID', 'ACC123456')
 */
export function createCopyTextButton(text: string, copyText: string): InlineButtonConfig {
    if (copyText.length > 256) {
        throw new Error('Copy text must be 256 characters or less')
    }
    return { text, copyText }
}

/**
 * Create an inline keyboard button that switches to inline mode in current chat
 *
 * @example
 * createSwitchInlineButton('Search', 'query')
 */
export function createSwitchInlineButton(
    text: string,
    query: string,
    currentChat = true
): InlineButtonConfig {
    return currentChat
        ? { text, switchInlineQueryCurrentChat: query }
        : { text, switchInlineQuery: query }
}

/**
 * Create an inline keyboard button with Telegram Login
 *
 * @example
 * createLoginButton('Login', 'https://example.com/auth')
 */
export function createLoginButton(
    text: string,
    url: string,
    options?: {
        forwardText?: string
        botUsername?: string
        requestWriteAccess?: boolean
    }
): InlineButtonConfig {
    if (!url.startsWith('https://')) {
        throw new Error('Login URL must start with https://')
    }
    return {
        text,
        loginUrl: {
            url,
            ...options,
        },
    }
}

// ============================================================================
// Reply Keyboard Button Builders
// ============================================================================

/**
 * Create a simple text button for reply keyboard
 *
 * @example
 * createTextButton('Main Menu')
 */
export function createTextButton(text: string): ReplyButtonConfig {
    return { text }
}

/**
 * Create a button that requests user's phone number
 *
 * @example
 * createContactButton('Share Contact')
 */
export function createContactButton(text: string): ReplyButtonConfig {
    return { text, requestContact: true }
}

/**
 * Create a button that requests user's location
 *
 * @example
 * createLocationButton('Share Location')
 */
export function createLocationButton(text: string): ReplyButtonConfig {
    return { text, requestLocation: true }
}

/**
 * Create a button that requests user to create a poll
 *
 * @example
 * createPollButton('Create Poll', 'quiz')
 */
export function createPollButton(
    text: string,
    type?: 'quiz' | 'regular'
): ReplyButtonConfig {
    return {
        text,
        requestPoll: type ? { type } : {},
    }
}

// ============================================================================
// Keyboard Builders
// ============================================================================

/**
 * Create an inline keyboard from button configurations
 *
 * @example
 * createInlineKeyboard([
 *   [createCallbackButton('Yes', 'yes'), createCallbackButton('No', 'no')],
 *   [createUrlButton('Help', 'https://example.com/help')]
 * ])
 */
export function createInlineKeyboard(buttons: InlineKeyboard): InlineKeyboardButton[][] {
    return buttons.map(row =>
        row.map(btn => {
            const button: any = { text: btn.text }

            if (btn.data) {
                return { ...button, callback_data: btn.data }
            }
            if (btn.url) {
                return { ...button, url: btn.url }
            }
            if (btn.webApp) {
                return { ...button, web_app: btn.webApp }
            }
            if (btn.loginUrl) {
                return {
                    ...button,
                    login_url: {
                        url: btn.loginUrl.url,
                        forward_text: btn.loginUrl.forwardText,
                        bot_username: btn.loginUrl.botUsername,
                        request_write_access: btn.loginUrl.requestWriteAccess,
                    },
                }
            }
            if (btn.switchInlineQuery !== undefined) {
                return { ...button, switch_inline_query: btn.switchInlineQuery }
            }
            if (btn.switchInlineQueryCurrentChat !== undefined) {
                return {
                    ...button,
                    switch_inline_query_current_chat: btn.switchInlineQueryCurrentChat,
                }
            }
            if (btn.copyText) {
                return { ...button, copy_text: { text: btn.copyText } }
            }
            if (btn.callbackGame) {
                return { ...button, callback_game: btn.callbackGame }
            }
            if (btn.pay) {
                return { ...button, pay: btn.pay }
            }

            // Default to callback button with text as data
            return { ...button, callback_data: btn.text }
        })
    )
}

/**
 * Create a reply keyboard from button configurations
 *
 * @example
 * createReplyKeyboard([
 *   [createTextButton('Main Menu'), createTextButton('Settings')],
 *   [createContactButton('Share Contact')]
 * ])
 */
export function createReplyKeyboard(buttons: ReplyKeyboard): KeyboardButton[][] {
    return buttons.map(row =>
        row.map(btn => {
            const button: KeyboardButton = { text: btn.text }

            if (btn.requestContact) {
                return { ...button, request_contact: true }
            }
            if (btn.requestLocation) {
                return { ...button, request_location: true }
            }
            if (btn.requestPoll) {
                return { ...button, request_poll: btn.requestPoll }
            }
            if (btn.webApp) {
                return { ...button, web_app: btn.webApp }
            }

            return button
        })
    )
}

// ============================================================================
// Quick Builders for Common Patterns
// ============================================================================

/**
 * Create a simple Yes/No confirmation keyboard
 *
 * @example
 * createYesNoKeyboard('confirm', 'cancel')
 */
export function createYesNoKeyboard(
    yesData = 'yes',
    noData = 'no'
): InlineKeyboard {
    return [
        [
            createCallbackButton('✅ Yes', yesData),
            createCallbackButton('❌ No', noData),
        ],
    ]
}

/**
 * Create a confirmation keyboard with custom text
 *
 * @example
 * createConfirmKeyboard('Enable Maintenance', 'maintenance_enable', 'maintenance_cancel')
 */
export function createConfirmKeyboard(
    action: string,
    confirmData: string,
    cancelData: string
): InlineKeyboard {
    return [
        [createCallbackButton(`✅ Confirm ${action}`, confirmData)],
        [createCallbackButton('❌ Cancel', cancelData)],
    ]
}

/**
 * Create a back button (common pattern)
 *
 * @example
 * createBackButton('back_to_menu')
 */
export function createBackButton(data = 'back'): InlineKeyboard {
    return [[createCallbackButton('← Back', data)]]
}

/**
 * Create a close/dismiss button
 *
 * @example
 * createCloseButton('close')
 */
export function createCloseButton(data = 'close'): InlineKeyboard {
    return [[createCallbackButton('✖️ Close', data)]]
}

/**
 * Create a pagination keyboard
 *
 * @example
 * createPaginationKeyboard(2, 10, 'page')
 */
export function createPaginationKeyboard(
    currentPage: number,
    totalPages: number,
    dataPrefix = 'page'
): InlineKeyboard {
    const buttons: InlineButtonConfig[] = []

    if (currentPage > 1) {
        buttons.push(createCallbackButton('◀️ Prev', `${dataPrefix}_${currentPage - 1}`))
    }

    buttons.push(
        createCallbackButton(`${currentPage}/${totalPages}`, `${dataPrefix}_current`)
    )

    if (currentPage < totalPages) {
        buttons.push(createCallbackButton('Next ▶️', `${dataPrefix}_${currentPage + 1}`))
    }

    return [buttons]
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Validate callback data length
 */
export function validateCallbackData(data: string): void {
    if (data.length > 64) {
        throw new Error(`Callback data too long (${data.length} bytes, max 64)`)
    }
}

/**
 * Create callback data with prefix
 *
 * @example
 * prefixCallbackData('user_info', '1234567890') // 'user_info:1234567890'
 */
export function prefixCallbackData(prefix: string, data: string): string {
    const result = `${prefix}:${data}`
    validateCallbackData(result)
    return result
}

/**
 * Parse prefixed callback data
 *
 * @example
 * parseCallbackData('user_info:1234567890') // { prefix: 'user_info', data: '1234567890' }
 */
export function parseCallbackData(
    callbackData: string
): { prefix: string; data: string } | null {
    const parts = callbackData.split(':')
    if (parts.length < 2) return null

    return {
        prefix: parts[0],
        data: parts.slice(1).join(':'),
    }
}
