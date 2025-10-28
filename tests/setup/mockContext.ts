/**
 * Mock BuilderBot context factory for testing
 * Creates realistic context objects without needing Telegram API
 */

export interface MockBotContext {
    from: string
    body: string
    name?: string
    pushName?: string
    id?: string
}

/**
 * Create a mock Telegram context for testing
 */
export function createMockContext(overrides: Partial<MockBotContext> = {}): MockBotContext {
    return {
        from: overrides.from || '+1234567890',
        body: overrides.body || 'Test message',
        name: overrides.name || 'Test User',
        pushName: overrides.pushName || 'Test User',
        id: overrides.id || `test-msg-${Date.now()}`,
    }
}

/**
 * Create a mock utils object for flows
 */
export function createMockUtils() {
    const state = new Map<string, any>()

    return {
        state: {
            get: (key: string) => state.get(key),
            getMyState: async () => Object.fromEntries(state),
            update: async (updates: Record<string, any>) => {
                Object.entries(updates).forEach(([key, value]) => {
                    state.set(key, value)
                })
            },
            clear: async () => state.clear(),
        },
        flowDynamic: async (message: string | string[]) => {
            // Mock implementation - just log
            console.log('flowDynamic:', message)
        },
        gotoFlow: async (flow: any) => {
            console.log('gotoFlow:', flow)
        },
        endFlow: async () => {
            console.log('endFlow')
        },
        fallBack: () => {
            console.log('fallBack')
        },
        blacklist: {
            add: async (number: string) => console.log('blacklist.add:', number),
            remove: async (number: string) => console.log('blacklist.remove:', number),
            check: async (number: string) => false,
        },
    }
}
