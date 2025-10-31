/**
 * Telegram Formatting Utilities
 *
 * Provides helpers for Telegram HTML formatting and parse_mode handling
 */

import type { BotMethods } from '@builderbot/bot/dist/types'
import type { TelegramProvider } from '@builderbot-plugins/telegram'

/**
 * Escape HTML special characters to prevent rendering issues
 *
 * Use this for any user-generated or dynamic content that might contain
 * HTML special characters like <, >, &, etc.
 *
 * @param text - Text to escape
 * @returns HTML-safe text
 *
 * @example
 * ```ts
 * const name = "<script>alert('xss')</script>"
 * const safe = escapeHtml(name) // "&lt;script&gt;alert('xss')&lt;/script&gt;"
 * ```
 */
export function escapeHtml(text: string): string {
    if (!text) return ''

    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

/**
 * Convert markdown syntax to HTML tags
 *
 * Converts common markdown patterns to Telegram HTML format:
 * - **bold** → <b>bold</b>
 * - *italic* → <i>italic</i>
 * - `code` → <code>code</code>
 * - [link](url) → <a href="url">link</a>
 *
 * Note: This is a simple converter for common patterns.
 * For complex markdown, consider using a markdown library.
 *
 * @param text - Markdown text
 * @returns HTML formatted text
 *
 * @example
 * ```ts
 * const md = "**Bold** and *italic* text"
 * const html = markdownToHtml(md) // "<b>Bold</b> and <i>italic</i> text"
 * ```
 */
export function markdownToHtml(text: string): string {
    if (!text) return ''

    return text
        // Bold: **text** or __text__
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/__(.+?)__/g, '<b>$1</b>')
        // Italic: *text* or _text_
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/_(.+?)_/g, '<i>$1</i>')
        // Code: `text`
        .replace(/`(.+?)`/g, '<code>$1</code>')
        // Links: [text](url)
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
}

/**
 * Send a formatted message with HTML parse_mode
 *
 * Wrapper for flowDynamic that automatically sets parse_mode to HTML.
 * This ensures markdown-style formatting renders correctly in Telegram.
 *
 * @param utils - Bot utils
 * @param message - Message text (can use HTML tags)
 * @param options - Additional options (delay, media, etc.)
 *
 * @example
 * ```ts
 * // Simple HTML message
 * await sendFormattedMessage(utils, '<b>Bold</b> and <i>italic</i>')
 *
 * // With delay
 * await sendFormattedMessage(utils, '<b>Hello!</b>', { delay: 1000 })
 *
 * // With media
 * await sendFormattedMessage(utils, 'Check this <b>image</b>', {
 *     media: 'https://example.com/image.png'
 * })
 * ```
 */
export async function sendFormattedMessage(
    ctx: any,
    utils: BotMethods<any, any>,
    message: string | string[],
    options?: {
        delay?: number
        media?: string
        disableWebPagePreview?: boolean
        disableNotification?: boolean
    }
): Promise<void> {
    const messages = Array.isArray(message) ? message : [message]
    const provider = utils.provider as TelegramProvider

    const extra = {
        parse_mode: 'HTML' as const,
        disable_web_page_preview: options?.disableWebPagePreview,
        disable_notification: options?.disableNotification,
    }

    for (const msg of messages) {
        if (options?.delay) {
            await new Promise(resolve => setTimeout(resolve, options.delay))
        }

        if (options?.media) {
            await provider.sendMedia(ctx.from, options.media, msg)
        } else {
            // Use telegram API directly - provider.sendMessage() doesn't forward parse_mode
            await provider.vendor.telegram.sendMessage(ctx.from, msg, extra)
        }
    }
}

/**
 * Convert markdown message to HTML and send with proper formatting
 *
 * Convenience function that combines markdownToHtml() and sendFormattedMessage().
 * Use this when you have markdown-style text and want to convert + send in one step.
 *
 * @param utils - Bot utils
 * @param markdownText - Text with markdown syntax
 * @param options - Send options
 *
 * @example
 * ```ts
 * await sendMarkdownAsHtml(utils, '**Bold** and *italic* text')
 * ```
 */
export async function sendMarkdownAsHtml(
    ctx: any,
    utils: BotMethods<any, any>,
    markdownText: string | string[],
    options?: {
        delay?: number
        media?: string
        disableWebPagePreview?: boolean
        disableNotification?: boolean
    }
): Promise<void> {
    const messages = Array.isArray(markdownText) ? markdownText : [markdownText]
    const htmlMessages = messages.map(markdownToHtml)

    await sendFormattedMessage(ctx, utils, htmlMessages, options)
}

/**
 * Format text with HTML tags (convenience helpers)
 */
export const html = {
    /**
     * Bold text: <b>text</b>
     */
    bold: (text: string) => `<b>${escapeHtml(text)}</b>`,

    /**
     * Italic text: <i>text</i>
     */
    italic: (text: string) => `<i>${escapeHtml(text)}</i>`,

    /**
     * Underline text: <u>text</u>
     */
    underline: (text: string) => `<u>${escapeHtml(text)}</u>`,

    /**
     * Strikethrough text: <s>text</s>
     */
    strike: (text: string) => `<s>${escapeHtml(text)}</s>`,

    /**
     * Monospace/code text: <code>text</code>
     */
    code: (text: string) => `<code>${escapeHtml(text)}</code>`,

    /**
     * Pre-formatted block: <pre>text</pre>
     */
    pre: (text: string) => `<pre>${escapeHtml(text)}</pre>`,

    /**
     * Link: <a href="url">text</a>
     */
    link: (text: string, url: string) => `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`,

    /**
     * Escape HTML but keep text as-is
     */
    escape: escapeHtml,
}
