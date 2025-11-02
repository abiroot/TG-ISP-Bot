/**
 * Mock Telegram Provider
 *
 * Test provider that simulates Telegram Bot API without actual connection
 * Captures messages for assertions and allows programmatic message injection
 */

import { EventEmitter } from 'events'
import { vi } from 'vitest'
import type { BotContext } from '@builderbot/bot/dist/types'

/**
 * Mock Telegram vendor (simulates Telegraf)
 */
export class MockTelegramVendor {
    // Track sent messages for assertions
    sentMessages: Array<{
        chatId: string
        text: string
        options?: any
        timestamp: Date
    }> = []

    /**
     * Mock Telegram API
     */
    telegram = {
        sendMessage: vi.fn(async (chatId: string, text: string, options?: any) => {
            this.sentMessages.push({
                chatId,
                text,
                options,
                timestamp: new Date(),
            })

            return {
                message_id: Date.now(),
                chat: { id: chatId },
                text,
                date: Math.floor(Date.now() / 1000),
            }
        }),

        answerCallbackQuery: vi.fn(async (callbackQueryId: string, text?: string) => {
            return true
        }),

        editMessageText: vi.fn(
            async (chatId: string, messageId: number, inlineMessageId: string, text: string, options?: any) => {
                return { message_id: messageId, chat: { id: chatId }, text }
            }
        ),

        deleteMessage: vi.fn(async (chatId: string, messageId: number) => {
            return true
        }),

        sendPhoto: vi.fn(async (chatId: string, photo: any, options?: any) => {
            this.sentMessages.push({
                chatId,
                text: '[PHOTO]',
                options,
                timestamp: new Date(),
            })
            return { message_id: Date.now(), chat: { id: chatId } }
        }),

        sendDocument: vi.fn(async (chatId: string, document: any, options?: any) => {
            this.sentMessages.push({
                chatId,
                text: '[DOCUMENT]',
                options,
                timestamp: new Date(),
            })
            return { message_id: Date.now(), chat: { id: chatId } }
        }),
    }

    /**
     * Get last sent message
     */
    getLastMessage(): { chatId: string; text: string; options?: any } | undefined {
        return this.sentMessages[this.sentMessages.length - 1]
    }

    /**
     * Get all sent messages
     */
    getAllMessages(): Array<{ chatId: string; text: string; options?: any }> {
        return this.sentMessages
    }

    /**
     * Get messages for specific chat
     */
    getMessagesForChat(chatId: string): Array<{ chatId: string; text: string; options?: any }> {
        return this.sentMessages.filter((msg) => msg.chatId === chatId)
    }

    /**
     * Clear sent messages
     */
    clearMessages() {
        this.sentMessages = []
    }

    /**
     * Reset all mocks
     */
    reset() {
        this.clearMessages()
        this.telegram.sendMessage.mockClear()
        this.telegram.answerCallbackQuery.mockClear()
        this.telegram.editMessageText.mockClear()
        this.telegram.deleteMessage.mockClear()
        this.telegram.sendPhoto.mockClear()
        this.telegram.sendDocument.mockClear()
    }
}

/**
 * Mock Telegram Provider
 * Simulates BuilderBot TelegramProvider for testing
 */
export class MockTelegramProvider extends EventEmitter {
    vendor: { telegram: MockTelegramVendor['telegram'] }
    globalVendorArgs: any
    idBotName: string = 'test-bot'
    idCtxBot: string = 'test-bot-ctx'
    server: any = null

    private mockVendor: MockTelegramVendor

    constructor() {
        super()
        this.mockVendor = new MockTelegramVendor()
        this.vendor = {
            telegram: this.mockVendor.telegram,
        }
        this.globalVendorArgs = {
            name: 'test-bot',
            port: 3000,
        }
    }

    /**
     * Send message (BuilderBot provider interface)
     */
    async sendMessage(chatId: string, text: string, options?: any): Promise<any> {
        return this.mockVendor.telegram.sendMessage(chatId, text, options)
    }

    /**
     * Save file (BuilderBot provider interface)
     */
    async saveFile(ctx: any, options?: { path: string }): Promise<string> {
        return '/tmp/mock-file.txt'
    }

    /**
     * Simulate incoming message from Telegram
     * This is the key method for testing - allows injecting messages into flows
     */
    async emitMessage(ctx: Partial<BotContext>) {
        const fullContext: BotContext = {
            from: ctx.from || 'test-user',
            body: ctx.body || 'test message',
            name: ctx.name,
            ...ctx,
        }

        // Emit message event that BuilderBot listens to
        this.emit('message', fullContext)

        // Allow time for async handlers
        await new Promise((resolve) => setImmediate(resolve))

        return fullContext
    }

    /**
     * Simulate callback query (button click)
     */
    async emitCallbackQuery(callbackQuery: {
        from: string
        data: string
        message?: any
    }) {
        this.emit('callback_query', {
            callbackQuery: {
                from: { id: callbackQuery.from },
                data: callbackQuery.data,
                message: callbackQuery.message,
            },
        })

        await new Promise((resolve) => setImmediate(resolve))
    }

    /**
     * Get last sent message
     */
    getLastMessage(): { chatId: string; text: string; options?: any } | undefined {
        return this.mockVendor.getLastMessage()
    }

    /**
     * Get all sent messages
     */
    getAllMessages(): Array<{ chatId: string; text: string; options?: any }> {
        return this.mockVendor.getAllMessages()
    }

    /**
     * Get messages for specific chat
     */
    getMessagesForChat(chatId: string): Array<{ chatId: string; text: string; options?: any }> {
        return this.mockVendor.getMessagesForChat(chatId)
    }

    /**
     * Wait for next outgoing message
     * Useful for testing: send message, then wait for bot response
     */
    async waitForMessage(timeout: number = 5000): Promise<{ chatId: string; text: string; options?: any }> {
        const startCount = this.mockVendor.sentMessages.length

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Timeout waiting for message after ${timeout}ms`))
            }, timeout)

            const checkInterval = setInterval(() => {
                if (this.mockVendor.sentMessages.length > startCount) {
                    clearTimeout(timeoutId)
                    clearInterval(checkInterval)
                    resolve(this.mockVendor.getLastMessage()!)
                }
            }, 10)
        })
    }

    /**
     * Clear all sent messages
     */
    clearMessages() {
        this.mockVendor.clearMessages()
    }

    /**
     * Reset provider state
     */
    reset() {
        this.mockVendor.reset()
        this.removeAllListeners()
    }

    /**
     * Start provider (no-op for mock)
     */
    async start() {
        this.emit('ready')
    }

    /**
     * Stop provider (no-op for mock)
     */
    async stop() {
        this.removeAllListeners()
    }

    /**
     * BuilderBot internal methods (stubs)
     */
    protected beforeHttpServerInit() {}
    protected afterHttpServerInit() {}
    protected busEvents() {
        return []
    }
    protected async initVendor() {
        return this.mockVendor
    }
}

/**
 * Create a mock Telegram provider instance
 */
export function createMockTelegramProvider(): MockTelegramProvider {
    return new MockTelegramProvider()
}
