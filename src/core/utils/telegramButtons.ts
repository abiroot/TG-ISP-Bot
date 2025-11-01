/**
 * Telegram Button Utilities
 *
 * Type-safe wrappers around Telegraf's Markup API for creating interactive buttons.
 * Supports inline keyboards and reply keyboards with full TypeScript support.
 *
 * ## Button Types
 *
 * **Inline Keyboards** - Buttons attached to messages (most common):
 * - Callback buttons - Trigger bot actions without sending messages
 * - URL buttons - Open links when clicked
 * - Web App buttons - Launch Telegram Web Apps
 * - Copy Text buttons - Copy text to clipboard
 * - Login buttons - Telegram Login Widget integration
 * - Switch Inline buttons - Switch to inline mode
 *
 * **Reply Keyboards** - Replace the text input area:
 * - Text buttons - Send button text as message
 * - Contact buttons - Request user's phone number
 * - Location buttons - Request user's location
 * - Poll buttons - Request user to create a poll
 *
 * ## Usage Pattern
 *
 * 1. Create buttons using builder functions (createCallbackButton, createUrlButton, etc.)
 * 2. Arrange buttons in a 2D array (rows and columns)
 * 3. Send via flow helpers (sendWithInlineButtons, sendWithReplyButtons)
 * 4. Handle callbacks via flows listening to BUTTON_* events
 *
 * ## Internal Implementation Note
 *
 * This module uses **camelCase** for TypeScript configs but converts to **snake_case**
 * for the Telegram Bot API. This conversion happens automatically in createInlineKeyboard()
 * and createReplyKeyboard().
 *
 * Example mapping:
 * - `{ data: 'value' }` → `{ callback_data: 'value' }`
 * - `{ copyText: 'text' }` → `{ copy_text: { text: 'text' } }`
 * - `{ webApp: { url } }` → `{ web_app: { url } }`
 *
 * @module telegramButtons
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
 * Converts our camelCase button configs to Telegram's snake_case API format.
 * Validates all buttons before conversion to catch errors early.
 *
 * **Internal Property Mapping (camelCase → snake_case):**
 * - `data` → `callback_data` (callback buttons)
 * - `webApp` → `web_app` (web app buttons)
 * - `loginUrl` → `login_url` (login buttons)
 * - `switchInlineQuery` → `switch_inline_query` (inline query buttons)
 * - `switchInlineQueryCurrentChat` → `switch_inline_query_current_chat`
 * - `copyText` → `copy_text: { text: "..." }` (copy text buttons)
 * - `callbackGame` → `callback_game` (game buttons)
 * - `pay` → `pay` (payment buttons)
 *
 * @param buttons - 2D array of inline button configurations
 * @returns Telegram-formatted inline keyboard markup
 * @throws {Error} If keyboard layout or any button is invalid
 *
 * @example
 * ```ts
 * createInlineKeyboard([
 *   [createCallbackButton('Yes', 'yes'), createCallbackButton('No', 'no')],
 *   [createUrlButton('Help', 'https://example.com/help')]
 * ])
 * // Returns: [[{ text: 'Yes', callback_data: 'yes' }, { text: 'No', callback_data: 'no' }],
 * //           [{ text: 'Help', url: 'https://example.com/help' }]]
 * ```
 */
export function createInlineKeyboard(buttons: InlineKeyboard): InlineKeyboardButton[][] {
    try {
        // Validate keyboard layout structure
        validateKeyboardLayout(buttons)

        // Validate and convert each button
        return buttons.map((row, rowIndex) =>
            row.map((btn, colIndex) => {
                // Validate button configuration
                validateInlineButton(btn, rowIndex, colIndex)

                const button: any = { text: btn.text }

                // Convert camelCase config to snake_case Telegram API format
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
                    // copy_text MUST be an object with 'text' property per Telegram API
                    return { ...button, copy_text: { text: btn.copyText } }
                }
                if (btn.callbackGame) {
                    return { ...button, callback_game: btn.callbackGame }
                }
                if (btn.pay) {
                    return { ...button, pay: btn.pay }
                }

                // This should never happen due to validation, but provide safe fallback
                throw new Error(`Button [row ${rowIndex}, col ${colIndex}] has no action defined`)
            })
        )
    } catch (error) {
        // Re-throw with additional context for debugging
        if (error instanceof Error) {
            throw new Error(`Failed to create inline keyboard: ${error.message}`)
        }
        throw error
    }
}

/**
 * Create a reply keyboard from button configurations
 *
 * Converts our camelCase button configs to Telegram's snake_case API format.
 * Validates all buttons before conversion to catch errors early.
 *
 * **Internal Property Mapping (camelCase → snake_case):**
 * - `requestContact` → `request_contact` (contact request buttons)
 * - `requestLocation` → `request_location` (location request buttons)
 * - `requestPoll` → `request_poll` (poll request buttons)
 * - `webApp` → `web_app` (web app buttons)
 *
 * @param buttons - 2D array of reply button configurations
 * @returns Telegram-formatted reply keyboard markup
 * @throws {Error} If keyboard layout or any button is invalid
 *
 * @example
 * ```ts
 * createReplyKeyboard([
 *   [createTextButton('Main Menu'), createTextButton('Settings')],
 *   [createContactButton('Share Contact')]
 * ])
 * // Returns: [[{ text: 'Main Menu' }, { text: 'Settings' }],
 * //           [{ text: 'Share Contact', request_contact: true }]]
 * ```
 */
export function createReplyKeyboard(buttons: ReplyKeyboard): KeyboardButton[][] {
    try {
        // Validate keyboard layout structure
        validateKeyboardLayout(buttons)

        // Validate and convert each button
        return buttons.map((row, rowIndex) =>
            row.map((btn, colIndex) => {
                // Validate button configuration
                validateReplyButton(btn, rowIndex, colIndex)

                const button: KeyboardButton = { text: btn.text }

                // Convert camelCase config to snake_case Telegram API format
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

                // Simple text button (no additional properties)
                return button
            })
        )
    } catch (error) {
        // Re-throw with additional context for debugging
        if (error instanceof Error) {
            throw new Error(`Failed to create reply keyboard: ${error.message}`)
        }
        throw error
    }
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
 * Validate inline button configuration
 *
 * Ensures button has required fields and proper structure before sending to Telegram.
 * Throws descriptive errors to help debug button issues.
 *
 * @throws {Error} If button is invalid
 */
export function validateInlineButton(btn: InlineButtonConfig, rowIndex: number, colIndex: number): void {
    const position = `[row ${rowIndex}, col ${colIndex}]`

    if (!btn.text || btn.text.trim() === '') {
        throw new Error(`Invalid button ${position}: 'text' is required and cannot be empty`)
    }

    if (btn.text.length > 64) {
        throw new Error(`Invalid button ${position}: 'text' must be 64 characters or less (got ${btn.text.length})`)
    }

    // Count how many action fields are set
    const actionFields = [
        btn.data,
        btn.url,
        btn.webApp,
        btn.loginUrl,
        btn.switchInlineQuery,
        btn.switchInlineQueryCurrentChat,
        btn.copyText,
        btn.callbackGame,
        btn.pay
    ].filter(field => field !== undefined)

    if (actionFields.length === 0) {
        throw new Error(
            `Invalid button ${position}: button "${btn.text}" must have at least one action ` +
            `(data, url, webApp, loginUrl, switchInlineQuery, switchInlineQueryCurrentChat, copyText, callbackGame, or pay)`
        )
    }

    if (actionFields.length > 1) {
        throw new Error(
            `Invalid button ${position}: button "${btn.text}" has multiple actions defined. ` +
            `Only one action type is allowed per button.`
        )
    }

    // Validate specific field constraints
    if (btn.data && btn.data.length > 64) {
        throw new Error(`Invalid button ${position}: 'callback_data' must be 64 bytes or less (got ${btn.data.length})`)
    }

    if (btn.url && !btn.url.match(/^(https?:\/\/|tg:\/\/)/)) {
        throw new Error(`Invalid button ${position}: 'url' must start with http://, https://, or tg:// (got "${btn.url}")`)
    }

    if (btn.webApp && !btn.webApp.url.startsWith('https://')) {
        throw new Error(`Invalid button ${position}: 'webApp.url' must start with https:// (got "${btn.webApp.url}")`)
    }

    if (btn.loginUrl && !btn.loginUrl.url.startsWith('https://')) {
        throw new Error(`Invalid button ${position}: 'loginUrl.url' must start with https:// (got "${btn.loginUrl.url}")`)
    }

    if (btn.copyText && btn.copyText.length > 256) {
        throw new Error(`Invalid button ${position}: 'copyText' must be 256 characters or less (got ${btn.copyText.length})`)
    }
}

/**
 * Validate reply button configuration
 *
 * @throws {Error} If button is invalid
 */
export function validateReplyButton(btn: ReplyButtonConfig, rowIndex: number, colIndex: number): void {
    const position = `[row ${rowIndex}, col ${colIndex}]`

    if (!btn.text || btn.text.trim() === '') {
        throw new Error(`Invalid button ${position}: 'text' is required and cannot be empty`)
    }

    if (btn.text.length > 64) {
        throw new Error(`Invalid button ${position}: 'text' must be 64 characters or less (got ${btn.text.length})`)
    }

    // Count how many action fields are set
    const actionFields = [
        btn.requestContact,
        btn.requestLocation,
        btn.requestPoll,
        btn.webApp
    ].filter(field => field !== undefined && field !== false)

    // Reply buttons can be simple text buttons with no actions, or have ONE action
    if (actionFields.length > 1) {
        throw new Error(
            `Invalid button ${position}: button "${btn.text}" has multiple actions defined. ` +
            `Only one action type is allowed per button.`
        )
    }

    if (btn.webApp && !btn.webApp.url.startsWith('https://')) {
        throw new Error(`Invalid button ${position}: 'webApp.url' must start with https:// (got "${btn.webApp.url}")`)
    }
}

/**
 * Validate keyboard layout structure
 *
 * @throws {Error} If keyboard layout is invalid
 */
export function validateKeyboardLayout(buttons: any[][]): void {
    if (!Array.isArray(buttons)) {
        throw new Error('Keyboard layout must be a 2D array (array of rows)')
    }

    if (buttons.length === 0) {
        throw new Error('Keyboard layout cannot be empty (must have at least one row)')
    }

    if (buttons.length > 100) {
        throw new Error(`Keyboard layout has too many rows (${buttons.length}, max 100)`)
    }

    buttons.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) {
            throw new Error(`Invalid keyboard layout: row ${rowIndex} must be an array`)
        }

        if (row.length === 0) {
            throw new Error(`Invalid keyboard layout: row ${rowIndex} is empty (must have at least one button)`)
        }

        if (row.length > 8) {
            throw new Error(
                `Invalid keyboard layout: row ${rowIndex} has too many buttons (${row.length}, max 8 recommended, absolute max 12)`
            )
        }
    })

    const totalButtons = buttons.reduce((sum, row) => sum + row.length, 0)
    if (totalButtons > 100) {
        throw new Error(`Keyboard has too many buttons total (${totalButtons}, max 100)`)
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
