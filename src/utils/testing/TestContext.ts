/**
 * Test Context Utilities
 *
 * Provides helpers for creating mock contexts, services, and test data.
 * Makes it easy to write unit and integration tests for flows and services.
 *
 * @example
 * ```typescript
 * describe('UserQueryFlow', () => {
 *   it('should handle user query', async () => {
 *     const ctx = createMockBotCtx({
 *       from: '+1234567890',
 *       body: 'Check user info'
 *     })
 *     const utils = createMockBotUtils()
 *     await flow.execute(ctx, utils)
 *   })
 * })
 * ```
 */

import { vi } from 'vitest'
import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'

/**
 * Create a mock BotContext for testing
 *
 * @param overrides - Properties to override
 * @returns Mock BotContext
 */
export function createMockBotCtx(overrides?: Partial<BotContext>): BotContext {
    const defaultContext: BotContext = {
        from: '+1234567890',
        body: 'test message',
        name: 'Test User',
        pushName: 'Test User',
        ...overrides,
    }

    return defaultContext
}

/**
 * Create a mock BotUtils for testing
 *
 * @param overrides - Methods to override
 * @returns Mock BotUtils
 */
export function createMockBotUtils(overrides?: Partial<BotMethods<any, any>>): BotMethods<any, any> {
    const stateStorage = new Map<string, any>()

    const defaultUtils: any = {
        flowDynamic: vi.fn().mockResolvedValue(undefined),
        gotoFlow: vi.fn().mockResolvedValue(undefined),
        endFlow: vi.fn().mockResolvedValue(undefined),
        fallBack: vi.fn().mockResolvedValue(undefined),
        blacklist: {
            add: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
            checkIf: vi.fn().mockResolvedValue(false),
            getList: vi.fn().mockResolvedValue([]),
        } as any,
        state: {
            update: vi.fn().mockImplementation(async (updates: Record<string, any>) => {
                Object.entries(updates).forEach(([key, value]) => {
                    stateStorage.set(key, value)
                })
            }),
            get: vi.fn().mockImplementation(async (key: string) => {
                return stateStorage.get(key)
            }),
            getMyState: vi.fn().mockImplementation(async () => {
                return Object.fromEntries(stateStorage)
            }),
            clear: vi.fn().mockImplementation(async () => {
                stateStorage.clear()
            }),
        } as any,
        provider: {} as any,
        database: {} as any,
        flows: [] as any,
        inRef: vi.fn() as any,
        ...overrides,
    }

    return defaultUtils
}

/**
 * Create a mock service container for testing
 *
 * @param serviceOverrides - Services to override
 * @returns Mock service object
 */
export function createMockServiceContainer(serviceOverrides?: Record<string, any>): Record<string, any> {
    // Return plain object with mock services (Container removed - unused infrastructure)
    return {
        aiService: createMockAIService(),
        ispService: createMockISPService(),
        messageService: createMockMessageService(),
        userManagementService: createMockUserManagementService(),
        mediaService: createMockMediaService(),
        botStateService: createMockBotStateService(),
        auditService: createMockAuditService(),
        errorHandler: createMockErrorHandler(),
        ...serviceOverrides,
    }
}

/**
 * Mock AI Service
 */
export function createMockAIService() {
    return {
        chat: vi.fn().mockResolvedValue('AI response'),
        generateResponse: vi.fn().mockResolvedValue('Generated response'),
        classifyIntent: vi.fn().mockResolvedValue({ intent: 'GREETING', confidence: 0.9 }),
    }
}

/**
 * Mock ISP Service
 */
export function createMockISPService() {
    return {
        getUserInfo: vi.fn().mockResolvedValue([
            {
                id: 1,
                firstName: 'John',
                lastName: 'Doe',
                mobile: '+1234567890',
                online: true,
            },
        ]),
        updateUserLocation: vi.fn().mockResolvedValue({ success: true }),
    }
}

/**
 * Mock Message Service
 */
export function createMockMessageService() {
    return {
        getConversationHistory: vi.fn().mockResolvedValue([]),
        logIncoming: vi.fn().mockResolvedValue(undefined),
        logOutgoing: vi.fn().mockResolvedValue(undefined),
    }
}

/**
 * Mock User Management Service
 */
export function createMockUserManagementService() {
    return {
        getPersonality: vi.fn().mockResolvedValue({
            id: '1',
            context_id: '+1234567890',
            bot_name: 'Test Bot',
            default_language: 'en',
            default_timezone: 'UTC',
            default_currency: 'USD',
        }),
        isWhitelisted: vi.fn().mockResolvedValue(true),
        isAdmin: vi.fn().mockResolvedValue(false),
    }
}

/**
 * Mock Media Service
 */
export function createMockMediaService() {
    return {
        transcribeVoice: vi.fn().mockResolvedValue('Transcribed text'),
        analyzeImage: vi.fn().mockResolvedValue({ description: 'Image description' }),
    }
}

/**
 * Mock Bot State Service
 */
export function createMockBotStateService() {
    return {
        isMaintenanceMode: vi.fn().mockResolvedValue(false),
        isFeatureEnabled: vi.fn().mockResolvedValue(true),
        getMaintenanceMessage: vi.fn().mockResolvedValue('Under maintenance'),
    }
}

/**
 * Mock Audit Service
 */
export function createMockAuditService() {
    return {
        logExecution: vi.fn().mockResolvedValue(undefined),
        getAuditLog: vi.fn().mockResolvedValue([]),
    }
}

/**
 * Mock Error Handler
 */
export function createMockErrorHandler() {
    return {
        handle: vi.fn().mockReturnValue({
            message: 'Error occurred',
            canRetry: true,
        }),
        classifyError: vi.fn().mockReturnValue('APPLICATION_ERROR'),
        shouldRetry: vi.fn().mockReturnValue(true),
    }
}

/**
 * Wait for async operations to complete
 *
 * @param ms - Milliseconds to wait
 */
export async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create a spy that tracks calls and arguments
 *
 * @param implementation - Function implementation
 * @returns Spied function
 */
export function createSpy<T extends (...args: any[]) => any>(implementation?: T): any {
    return vi.fn(implementation)
}
