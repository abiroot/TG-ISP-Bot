/**
 * Flow Test Harness
 *
 * Enables e2e testing of BuilderBot flows with EXACT conversation simulation
 * Uses BuilderBot's CoreClass for real message routing and state management
 */

import { createBot, createFlow } from '@builderbot/bot'
import type { TFlow, BotContext } from '@builderbot/bot/dist/types'
import { MockTelegramProvider } from './MockTelegramProvider'
import { MockDatabase } from './MockDatabase'

/**
 * Configuration for FlowTestHarness
 */
export interface HarnessConfig {
    flows: TFlow[]
    extensions?: Record<string, any>
    debug?: boolean
}

/**
 * Message sent during conversation
 */
export interface ConversationMessage {
    from: string
    body: string
    name?: string
    [key: string]: any
}

/**
 * Bot response
 */
export interface BotResponse {
    messages: Array<{ chatId: string; text: string; options?: any }>
    lastMessage?: { chatId: string; text: string; options?: any }
}

/**
 * Flow Test Harness
 *
 * Simulates EXACT BuilderBot conversation flow including:
 * - Real message routing via CoreClass
 * - State persistence between messages
 * - Multi-turn conversations
 * - Flow navigation (gotoFlow, endFlow)
 * - Real AI integration (if provided)
 */
export class FlowTestHarness {
    private bot: any
    private provider: MockTelegramProvider
    private database: MockDatabase
    private extensions: Record<string, any>
    private debug: boolean

    /**
     * Create a new test harness
     */
    constructor(config: HarnessConfig) {
        this.provider = new MockTelegramProvider()
        this.database = new MockDatabase()
        this.extensions = config.extensions || {}
        this.debug = config.debug || false

        // Initialize bot with test adapters
        this.initializeBot(config.flows)
    }

    /**
     * Initialize BuilderBot with test adapters
     */
    private async initializeBot(flows: TFlow[]) {
        const flowAdapter = createFlow(flows)

        this.bot = await createBot(
            {
                flow: flowAdapter,
                provider: this.provider as any,
                database: this.database as any,
            },
            {
                extensions: this.extensions,
            }
        )

        if (this.debug) {
            console.log('[FlowTestHarness] Bot initialized with', flows.length, 'flows')
        }
    }

    /**
     * Send a message from a user and get bot's response
     *
     * This simulates a real Telegram message:
     * 1. Provider emits 'message' event
     * 2. CoreClass routes to matching flow
     * 3. Flow executes with real state management
     * 4. Bot sends response via provider
     *
     * @param from - User ID (phone number or chat ID)
     * @param body - Message text
     * @param context - Additional context (name, etc.)
     * @returns Bot's response messages
     */
    async sendMessage(
        from: string,
        body: string,
        context?: Partial<BotContext>
    ): Promise<BotResponse> {
        const messageCount = this.provider.getAllMessages().length

        // Create message context
        const ctx: BotContext = {
            from,
            body,
            name: context?.name,
            ...context,
        }

        if (this.debug) {
            console.log(`[FlowTestHarness] User message: ${from} -> "${body}"`)
        }

        // Emit message event (triggers flow routing)
        await this.provider.emitMessage(ctx)

        // Wait for async flow execution
        await this.waitForMessages(messageCount + 1, 5000)

        // Get new messages
        const allMessages = this.provider.getAllMessages()
        const newMessages = allMessages.slice(messageCount)

        if (this.debug && newMessages.length > 0) {
            newMessages.forEach((msg) => {
                console.log(`[FlowTestHarness] Bot response: -> "${msg.text}"`)
            })
        }

        return {
            messages: newMessages,
            lastMessage: newMessages[newMessages.length - 1],
        }
    }

    /**
     * Simulate a multi-turn conversation
     *
     * Example:
     * ```ts
     * const responses = await harness.simulateConversation([
     *   { from: '+123', body: 'lookup customer' },
     *   { from: '+123', body: 'josianeyoussef' }
     * ])
     * ```
     *
     * @param messages - Array of messages to send
     * @returns Array of bot responses for each message
     */
    async simulateConversation(messages: ConversationMessage[]): Promise<BotResponse[]> {
        const responses: BotResponse[] = []

        for (const message of messages) {
            const response = await this.sendMessage(message.from, message.body, message)
            responses.push(response)

            // Small delay between messages (realistic timing)
            await this.wait(50)
        }

        return responses
    }

    /**
     * Simulate button click (callback query)
     *
     * @param from - User ID
     * @param callbackData - Callback data (e.g., "action_confirm:123")
     */
    async clickButton(from: string, callbackData: string): Promise<BotResponse> {
        const messageCount = this.provider.getAllMessages().length

        if (this.debug) {
            console.log(`[FlowTestHarness] Button click: ${from} -> "${callbackData}"`)
        }

        await this.provider.emitCallbackQuery({
            from,
            data: callbackData,
        })

        await this.waitForMessages(messageCount + 1, 5000)

        const allMessages = this.provider.getAllMessages()
        const newMessages = allMessages.slice(messageCount)

        return {
            messages: newMessages,
            lastMessage: newMessages[newMessages.length - 1],
        }
    }

    /**
     * Get all messages sent to a specific user
     */
    getMessagesForUser(userId: string): Array<{ chatId: string; text: string; options?: any }> {
        return this.provider.getMessagesForChat(userId)
    }

    /**
     * Get last bot response
     */
    getLastResponse(): { chatId: string; text: string; options?: any } | undefined {
        return this.provider.getLastMessage()
    }

    /**
     * Get all bot responses
     */
    getAllResponses(): Array<{ chatId: string; text: string; options?: any }> {
        return this.provider.getAllMessages()
    }

    /**
     * Get conversation state for a user
     */
    getState(userId: string): any {
        // Access BuilderBot's internal state handler
        return this.bot?.stateHandler?.state?.get(userId) || {}
    }

    /**
     * Clear conversation state for a user
     */
    clearState(userId: string): void {
        this.bot?.stateHandler?.state?.clear(userId)
    }

    /**
     * Reset harness (clear messages and state)
     */
    reset(): void {
        this.provider.reset()
        this.database.reset()

        if (this.debug) {
            console.log('[FlowTestHarness] Reset complete')
        }
    }

    /**
     * Get access to mock database (for assertions)
     */
    getDatabase(): MockDatabase {
        return this.database
    }

    /**
     * Get access to mock provider (for assertions)
     */
    getProvider(): MockTelegramProvider {
        return this.provider
    }

    /**
     * Get access to extensions (for assertions)
     */
    getExtensions(): Record<string, any> {
        return this.extensions
    }

    /**
     * Wait for bot to send messages
     */
    private async waitForMessages(expectedCount: number, timeout: number = 5000): Promise<void> {
        const startTime = Date.now()

        while (this.provider.getAllMessages().length < expectedCount) {
            if (Date.now() - startTime > timeout) {
                if (this.debug) {
                    console.warn(
                        `[FlowTestHarness] Timeout waiting for ${expectedCount} messages (got ${this.provider.getAllMessages().length})`
                    )
                }
                break
            }

            await this.wait(10)
        }

        // Additional wait for any async operations
        await this.wait(50)
    }

    /**
     * Wait helper
     */
    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Enable debug logging
     */
    enableDebug(): void {
        this.debug = true
    }

    /**
     * Disable debug logging
     */
    disableDebug(): void {
        this.debug = false
    }
}

/**
 * Create a Flow Test Harness instance
 *
 * @param flows - BuilderBot flows to test
 * @param extensions - Service extensions (AI, ISP, etc.)
 * @param debug - Enable debug logging
 * @returns FlowTestHarness instance
 */
export function createFlowTestHarness(
    flows: TFlow[],
    extensions?: Record<string, any>,
    debug?: boolean
): FlowTestHarness {
    return new FlowTestHarness({
        flows,
        extensions,
        debug,
    })
}
