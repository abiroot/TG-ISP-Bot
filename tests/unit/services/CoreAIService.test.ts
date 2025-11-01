/**
 * Core AI Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CoreAIService } from '~/features/conversation/services/CoreAIService'
import type { ConversationContext } from '~/features/conversation/services/CoreAIService'

// Mock dependencies
vi.mock('@ai-sdk/openai', () => ({
    openai: vi.fn(() => 'gpt-4o-mini'),
}))

vi.mock('@langchain/openai', () => ({
    OpenAIEmbeddings: vi.fn().mockImplementation(() => ({
        embedQuery: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
        embedDocuments: vi.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
    })),
}))

vi.mock('ai', () => ({
    generateText: vi.fn().mockResolvedValue({
        text: 'AI response',
        usage: { totalTokens: 100 },
        toolCalls: [],
        toolResults: [],
        steps: [],
    }),
    streamText: vi.fn(),
}))

describe('CoreAIService', () => {
    let aiService: CoreAIService

    beforeEach(() => {
        aiService = new CoreAIService()
    })

    describe('Initialization', () => {
        it('should initialize with default RAG config', () => {
            const config = aiService.getRAGConfig()

            expect(config).toBeDefined()
            expect(config.enabled).toBe(true)
            expect(config.chunkSize).toBeGreaterThan(0)
        })

        it('should initialize with custom RAG config', () => {
            const customService = new CoreAIService({
                enabled: false,
                chunkSize: 20,
            })

            const config = customService.getRAGConfig()

            expect(config.enabled).toBe(false)
            expect(config.chunkSize).toBe(20)
        })
    })

    describe('Chat', () => {
        const mockContext: ConversationContext = {
            contextId: 'test-context',
            userPhone: '+1234567890',
            userName: 'Test User',
            personality: {
                id: '1',
                context_id: 'test-context',
                context_type: 'private',
                bot_name: 'Test Bot',
                default_currency: 'USD',
                default_timezone: 'UTC',
                default_language: 'en',
                created_by: 'test',
                created_at: new Date(),
                updated_at: new Date(),
            },
            recentMessages: [
                {
                    id: '1',
                    message_id: 'msg1',
                    context_id: 'test-context',
                    context_type: 'private',
                    direction: 'incoming',
                    sender: '+1234567890',
                    content: 'Hello',
                    status: 'sent',
                    metadata: {},
                    created_at: new Date(),
                    is_deleted: false,
                    is_bot_command: false,
                    is_admin_command: false,
                },
            ],
        }

        it('should generate chat response', async () => {
            const response = await aiService.chat(mockContext)

            expect(response).toBeDefined()
            expect(response.text).toBe('AI response')
            expect(response.responseTimeMs).toBeGreaterThan(0)
        })

        it('should handle chat with tools', async () => {
            const mockTools = {
                testTool: {
                    description: 'Test tool',
                    parameters: {},
                    execute: vi.fn(),
                },
            }

            const response = await aiService.chat(mockContext, mockTools)

            expect(response).toBeDefined()
        })

        it('should track response time', async () => {
            const response = await aiService.chat(mockContext)

            expect(response.responseTimeMs).toBeGreaterThan(0)
            expect(typeof response.responseTimeMs).toBe('number')
        })
    })

    describe('RAG Configuration', () => {
        it('should update RAG config', () => {
            aiService.updateRAGConfig({ chunkSize: 15, topK: 5 })

            const config = aiService.getRAGConfig()

            expect(config.chunkSize).toBe(15)
            expect(config.topK).toBe(5)
        })

        it('should preserve other config when updating', () => {
            const originalEnabled = aiService.getRAGConfig().enabled

            aiService.updateRAGConfig({ chunkSize: 15 })

            expect(aiService.getRAGConfig().enabled).toBe(originalEnabled)
        })
    })

    describe('Embeddings', () => {
        it('should check if context has embeddings', async () => {
            const hasEmbeddings = await aiService.hasEmbeddings('test-context')

            expect(typeof hasEmbeddings).toBe('boolean')
        })

        it('should delete embeddings for context', async () => {
            const deleted = await aiService.deleteEmbeddings('test-context')

            expect(typeof deleted).toBe('number')
        })
    })
})
