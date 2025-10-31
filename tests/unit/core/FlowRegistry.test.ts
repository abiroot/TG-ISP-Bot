/**
 * Flow Registry Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FlowRegistry, FlowCategory, createFlowMetadata } from '~/core/FlowRegistry'

// Mock environment
vi.mock('~/config/env', () => ({
    env: {
        NODE_ENV: 'development',
    },
}))

describe('FlowRegistry', () => {
    let registry: FlowRegistry

    beforeEach(() => {
        registry = new FlowRegistry()
    })

    describe('Flow Registration', () => {
        it('should register a flow', () => {
            const metadata = createFlowMetadata({
                name: 'test-flow',
                category: FlowCategory.COMMANDS,
                description: 'Test flow',
            })
            const mockFlow = { name: 'test' } as any

            registry.register(metadata, mockFlow)

            expect(registry.has('test-flow')).toBe(true)
        })

        it('should register multiple flows', () => {
            const flows: Array<[any, any]> = [
                [
                    createFlowMetadata({
                        name: 'flow1',
                        category: FlowCategory.ADMIN,
                        description: 'Flow 1',
                    }),
                    { name: 'flow1' },
                ],
                [
                    createFlowMetadata({
                        name: 'flow2',
                        category: FlowCategory.USER,
                        description: 'Flow 2',
                    }),
                    { name: 'flow2' },
                ],
            ]

            registry.registerBatch(flows as any)

            expect(registry.has('flow1')).toBe(true)
            expect(registry.has('flow2')).toBe(true)
        })

        it('should retrieve flow metadata', () => {
            const metadata = createFlowMetadata({
                name: 'test-flow',
                category: FlowCategory.COMMANDS,
                description: 'Test flow',
            })

            registry.register(metadata, {} as any)

            const retrieved = registry.getFlowMetadata('test-flow')
            expect(retrieved).toEqual(metadata)
        })
    })

    describe('Flow Ordering', () => {
        beforeEach(() => {
            // Register flows in random order
            registry.register(
                createFlowMetadata({
                    name: 'fallback',
                    category: FlowCategory.FALLBACK,
                    description: 'Fallback flow',
                }),
                { name: 'fallback' } as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'admin',
                    category: FlowCategory.ADMIN,
                    description: 'Admin flow',
                }),
                { name: 'admin' } as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'user',
                    category: FlowCategory.COMMANDS,
                    description: 'User flow',
                }),
                { name: 'user' } as any
            )
        })

        it('should order flows by category priority', () => {
            const flows = registry.getFlowsInOrder()

            expect(flows).toHaveLength(3)
            expect((flows[0] as any).name).toBe('admin') // ADMIN = 1
            expect((flows[1] as any).name).toBe('user') // COMMANDS = 2
            expect((flows[2] as any).name).toBe('fallback') // FALLBACK = 99
        })

        it('should order flows by custom priority within category', () => {
            registry.register(
                createFlowMetadata({
                    name: 'high-priority',
                    category: FlowCategory.ADMIN,
                    description: 'High priority admin flow',
                    priority: 1,
                }),
                { name: 'high-priority' } as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'low-priority',
                    category: FlowCategory.ADMIN,
                    description: 'Low priority admin flow',
                    priority: 10,
                }),
                { name: 'low-priority' } as any
            )

            const flows = registry.getFlowsInOrder()
            const adminFlows = flows.slice(0, 3) // First 3 are admin category

            expect((adminFlows[0] as any).name).toBe('admin') // No priority (0)
            expect((adminFlows[1] as any).name).toBe('high-priority') // Priority 1
            expect((adminFlows[2] as any).name).toBe('low-priority') // Priority 10
        })
    })

    describe('Environment Filtering', () => {
        it('should filter example flows in production', () => {
            // Override env for this test
            vi.mocked(require('~/config/env').env.NODE_ENV).mockReturnValue('production')

            registry.register(
                createFlowMetadata({
                    name: 'example',
                    category: FlowCategory.EXAMPLES,
                    description: 'Example flow',
                }),
                { name: 'example' } as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'production',
                    category: FlowCategory.COMMANDS,
                    description: 'Production flow',
                }),
                { name: 'production' } as any
            )

            const flows = registry.getFlowsInOrder({ includeExamples: false })

            expect(flows).toHaveLength(1)
            expect((flows[0] as any).name).toBe('production')
        })

        it('should include example flows in development', () => {
            registry.register(
                createFlowMetadata({
                    name: 'example',
                    category: FlowCategory.EXAMPLES,
                    description: 'Example flow',
                }),
                { name: 'example' } as any
            )

            const flows = registry.getFlowsInOrder({ includeExamples: true })

            expect(flows.some((f: any) => f.name === 'example')).toBe(true)
        })
    })

    describe('Flow Statistics', () => {
        it('should return accurate statistics', () => {
            registry.register(
                createFlowMetadata({
                    name: 'admin1',
                    category: FlowCategory.ADMIN,
                    description: 'Admin flow 1',
                }),
                {} as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'admin2',
                    category: FlowCategory.ADMIN,
                    description: 'Admin flow 2',
                }),
                {} as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'user1',
                    category: FlowCategory.COMMANDS,
                    description: 'User flow 1',
                }),
                {} as any
            )

            const stats = registry.getStats()

            expect(stats.total).toBe(3)
            expect(stats.byCategory['ADMIN']).toBe(2)
            expect(stats.byCategory['COMMANDS']).toBe(1)
        })
    })

    describe('Validation', () => {
        it('should validate successfully with fallback flow', () => {
            registry.register(
                createFlowMetadata({
                    name: 'fallback',
                    category: FlowCategory.FALLBACK,
                    description: 'Fallback flow',
                }),
                {} as any
            )

            expect(() => registry.validate()).not.toThrow()
        })

        it('should throw error when no flows registered', () => {
            expect(() => registry.validate()).toThrow('No flows registered')
        })
    })

    describe('Flow Retrieval', () => {
        it('should get flows by category', () => {
            registry.register(
                createFlowMetadata({
                    name: 'admin1',
                    category: FlowCategory.ADMIN,
                    description: 'Admin 1',
                }),
                { name: 'admin1' } as any
            )

            registry.register(
                createFlowMetadata({
                    name: 'admin2',
                    category: FlowCategory.ADMIN,
                    description: 'Admin 2',
                }),
                { name: 'admin2' } as any
            )

            const adminFlows = registry.getFlowsByCategory(FlowCategory.ADMIN)

            expect(adminFlows).toHaveLength(2)
        })
    })
})
