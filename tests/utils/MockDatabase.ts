/**
 * Mock Database Adapter
 *
 * In-memory database for testing BuilderBot flows without PostgreSQL
 * Implements BuilderBot's MemoryDB interface + custom repository mocks
 */

import { vi } from 'vitest'
import type { Message } from '~/database/schemas/message'
import type { Personality } from '~/database/schemas/personality'
import { findPersonality, allPersonalities } from '../fixtures/personalities.js'
import { getConversationHistory, allConversations } from '../fixtures/messages.js'

/**
 * Mock Database implementing BuilderBot's MemoryDB interface
 */
export class MockDatabase {
    // BuilderBot MemoryDB properties
    listHistory: any[] = []

    // In-memory storage
    private messages: Map<string, Message> = new Map()
    private personalities: Map<string, Personality> = new Map()
    private conversationHistory: Map<string, Message[]> = new Map()

    constructor() {
        // Pre-populate with fixture data
        this.loadFixtures()
    }

    /**
     * Load fixture data into mock database
     */
    private loadFixtures() {
        // Load personalities
        allPersonalities.forEach((personality) => {
            this.personalities.set(personality.context_id, personality)
        })

        // Load conversation messages
        Object.values(allConversations)
            .flat()
            .forEach((message) => {
                this.messages.set(message.id, message)

                // Group by context_id for conversation history
                const existing = this.conversationHistory.get(message.context_id) || []
                existing.push(message)
                this.conversationHistory.set(message.context_id, existing)
            })
    }

    /**
     * BuilderBot MemoryDB: Get previous messages by number
     */
    async getPrevByNumber(from: string): Promise<any> {
        const history = this.conversationHistory.get(from) || []
        return history[history.length - 1]
    }

    /**
     * BuilderBot MemoryDB: Save context
     */
    async save(ctx: any): Promise<void> {
        this.listHistory.push(ctx)
    }

    /**
     * Mock Message Repository
     */
    messageRepository = {
        create: vi.fn(async (message: Partial<Message>): Promise<Message> => {
            const newMessage: Message = {
                id: message.id || `msg-${Date.now()}`,
                message_id: message.message_id || `telegram-${Date.now()}`,
                context_id: message.context_id!,
                context_type: message.context_type || 'private',
                direction: message.direction || 'incoming',
                sender: message.sender!,
                recipient: message.recipient,
                content: message.content,
                status: message.status || 'sent',
                metadata: message.metadata || {},
                created_at: message.created_at || new Date(),
                is_bot_command: message.is_bot_command || false,
                is_admin_command: message.is_admin_command || false,
                is_deleted: message.is_deleted || false,
            }

            this.messages.set(newMessage.id, newMessage)

            // Add to conversation history
            const existing = this.conversationHistory.get(newMessage.context_id) || []
            existing.push(newMessage)
            this.conversationHistory.set(newMessage.context_id, existing)

            return newMessage
        }),

        getConversationHistory: vi.fn(
            async (contextId: string, limit: number = 50): Promise<Message[]> => {
                const history = this.conversationHistory.get(contextId) || []
                return history.slice(-limit).reverse() // Return most recent first
            }
        ),

        findById: vi.fn(async (id: string): Promise<Message | null> => {
            return this.messages.get(id) || null
        }),

        getAll: vi.fn(async (): Promise<Message[]> => {
            return Array.from(this.messages.values())
        }),
    }

    /**
     * Mock Personality Repository
     */
    personalityRepository = {
        findByContextId: vi.fn(async (contextId: string): Promise<Personality | null> => {
            return this.personalities.get(contextId) || null
        }),

        create: vi.fn(async (personality: Partial<Personality>): Promise<Personality> => {
            const newPersonality: Personality = {
                id: personality.id || `personality-${Date.now()}`,
                context_id: personality.context_id!,
                context_type: personality.context_type || 'private',
                bot_name: personality.bot_name || 'Test Bot',
                created_by: personality.created_by || 'test',
                created_at: personality.created_at || new Date(),
                updated_at: personality.updated_at || new Date(),
            }

            this.personalities.set(newPersonality.context_id, newPersonality)
            return newPersonality
        }),

        update: vi.fn(async (contextId: string, updates: Partial<Personality>): Promise<Personality | null> => {
            const existing = this.personalities.get(contextId)
            if (!existing) return null

            const updated: Personality = {
                ...existing,
                ...updates,
                updated_at: new Date(),
            }

            this.personalities.set(contextId, updated)
            return updated
        }),

        delete: vi.fn(async (contextId: string): Promise<boolean> => {
            return this.personalities.delete(contextId)
        }),

        getAll: vi.fn(async (): Promise<Personality[]> => {
            return Array.from(this.personalities.values())
        }),
    }

    /**
     * Mock Whitelist Repository
     */
    whitelistRepository = {
        isGroupWhitelisted: vi.fn(async (groupId: string): Promise<boolean> => {
            // For testing, accept all test group IDs
            return groupId.startsWith('-') || groupId.includes('test')
        }),

        isUserWhitelisted: vi.fn(async (userId: string): Promise<boolean> => {
            // For testing, accept all test user IDs
            return userId.includes('test') || userId.startsWith('+')
        }),

        addGroup: vi.fn(async (groupId: string, addedBy: string): Promise<void> => {
            // No-op for tests
        }),

        addUser: vi.fn(async (userId: string, addedBy: string): Promise<void> => {
            // No-op for tests
        }),

        removeGroup: vi.fn(async (groupId: string): Promise<boolean> => {
            return true
        }),

        removeUser: vi.fn(async (userId: string): Promise<boolean> => {
            return true
        }),

        listAll: vi.fn(async (): Promise<{ groups: string[]; users: string[] }> => {
            return { groups: [], users: [] }
        }),
    }

    /**
     * Mock User Role Repository
     */
    userRoleRepository = {
        getUserRoles: vi.fn(async (userId: string): Promise<string[]> => {
            // Test users have 'user' role
            if (userId.includes('admin')) {
                return ['admin', 'user']
            }
            return ['user']
        }),

        assignRole: vi.fn(async (userId: string, role: string): Promise<void> => {
            // No-op for tests
        }),

        removeRole: vi.fn(async (userId: string, role: string): Promise<void> => {
            // No-op for tests
        }),
    }

    /**
     * Reset database to initial state
     */
    reset() {
        this.listHistory = []
        this.messages.clear()
        this.personalities.clear()
        this.conversationHistory.clear()
        this.loadFixtures()
    }

    /**
     * Clear all data
     */
    clear() {
        this.listHistory = []
        this.messages.clear()
        this.personalities.clear()
        this.conversationHistory.clear()
    }
}

/**
 * Create a mock database instance
 */
export function createMockDatabase(): MockDatabase {
    return new MockDatabase()
}
