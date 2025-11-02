/**
 * Demo Test - Simple Flow Test
 *
 * Demonstrates how FlowTestHarness works with a minimal example flow
 */

import { describe, it, expect } from 'vitest'
import { addKeyword } from '@builderbot/bot'
import { createFlowTestHarness } from '../utils/FlowTestHarness.js'
import { createMockISPService } from '../utils/MockISPService.js'

describe('Demo: FlowTestHarness with Simple Flow', () => {
    it('should execute a simple echo flow', async () => {
        // Create a simple test flow
        const echoFlow = addKeyword(['echo', 'repeat']).addAnswer(
            'You said: {{body}}',
            null,
            async (ctx, { flowDynamic }) => {
                await flowDynamic(`Echo: ${ctx.body}`)
            }
        )

        // Create harness
        const harness = createFlowTestHarness([echoFlow])

        // Send message
        const response = await harness.sendMessage('+123', 'echo hello world')

        // Verify response
        expect(response.messages.length).toBeGreaterThan(0)
        const lastMsg = response.lastMessage
        expect(lastMsg).toBeDefined()
        expect(lastMsg?.text).toContain('Echo:')
    })

    it('should handle flows with state', async () => {
        // Create flow that uses state
        const stateFlow = addKeyword(['start']).addAnswer(
            'Process started!',
            null,
            async (ctx, { state, flowDynamic }) => {
                await state.update({ processStarted: true, userId: ctx.from })
                await flowDynamic('State saved!')
            }
        )

        const checkStateFlow = addKeyword(['check']).addAnswer(
            'Checking state...',
            null,
            async (ctx, { state, flowDynamic }) => {
                const processStarted = await state.get('processStarted')
                if (processStarted) {
                    await flowDynamic('Process is active!')
                } else {
                    await flowDynamic('No active process')
                }
            }
        )

        // Create harness with both flows
        const harness = createFlowTestHarness([stateFlow, checkStateFlow])

        // Start process
        const r1 = await harness.sendMessage('+123', 'start')
        expect(r1.lastMessage?.text).toContain('State saved')

        // Verify state was saved
        const state = harness.getState('+123')
        expect(state.processStarted).toBe(true)
        expect(state.userId).toBe('+123')

        // Check process
        const r2 = await harness.sendMessage('+123', 'check')
        expect(r2.lastMessage?.text).toContain('Process is active')
    })

    it('should handle flows with mock services', async () => {
        // Create mock service
        const mockISP = createMockISPService()

        // Create flow that uses ISP service
        const lookupFlow = addKeyword(['lookup']).addAnswer(
            'Looking up customer...',
            null,
            async (ctx, { flowDynamic, extensions }) => {
                const { ispService } = extensions as any

                // Search customer
                const results = await ispService.searchCustomer('josianeyoussef')

                if (results.length > 0) {
                    const customer = results[0]
                    await flowDynamic(`Found: ${customer.firstName} ${customer.lastName}`)
                } else {
                    await flowDynamic('Customer not found')
                }
            }
        )

        // Create harness with service
        const harness = createFlowTestHarness([lookupFlow], {
            ispService: mockISP,
        })

        // Send lookup message
        const response = await harness.sendMessage('+123', 'lookup')

        // Verify service was called
        expect(mockISP.searchCustomerCalls).toHaveLength(1)
        expect(mockISP.searchCustomerCalls[0].identifier).toBe('josianeyoussef')

        // Verify response
        expect(response.lastMessage?.text).toContain('Josiane Youssef')
    })

    it('should handle multi-turn conversation', async () => {
        // Create flow with capture mode
        const multiTurnFlow = addKeyword(['greet']).addAnswer(
            'What is your name?',
            { capture: true },
            async (ctx, { flowDynamic }) => {
                const name = ctx.body
                await flowDynamic(`Hello, ${name}! Nice to meet you.`)
            }
        )

        const harness = createFlowTestHarness([multiTurnFlow])

        // Turn 1: Trigger flow
        const r1 = await harness.sendMessage('+123', 'greet')
        expect(r1.lastMessage?.text).toContain('What is your name')

        // Turn 2: Provide name
        const r2 = await harness.sendMessage('+123', 'Alice')
        expect(r2.lastMessage?.text).toContain('Hello, Alice')
        expect(r2.lastMessage?.text).toContain('Nice to meet you')
    })

    it('should test complete conversation flow', async () => {
        const mockISP = createMockISPService()

        // Create flows
        const helpFlow = addKeyword(['help', 'commands']).addAnswer(
            'Available commands: lookup, status, help'
        )

        const lookupFlow = addKeyword(['lookup', 'search']).addAnswer(
            'What customer do you want to lookup?',
            { capture: true },
            async (ctx, { flowDynamic, extensions }) => {
                const identifier = ctx.body
                const { ispService } = extensions as any

                const results = await ispService.searchCustomer(identifier)

                if (results.length > 0) {
                    const customer = results[0]
                    const status = customer.online ? '🟢 Online' : '🔴 Offline'
                    await flowDynamic(
                        `📋 Customer Info:\n` +
                            `Name: ${customer.firstName} ${customer.lastName}\n` +
                            `Status: ${status}\n` +
                            `Phone: ${customer.mobile}`
                    )
                } else {
                    await flowDynamic(`❌ Customer not found: ${identifier}`)
                }
            }
        )

        const harness = createFlowTestHarness([helpFlow, lookupFlow], {
            ispService: mockISP,
        })

        // Simulate complete conversation
        const conversation = await harness.simulateConversation([
            { from: '+123', body: 'help' },
            { from: '+123', body: 'lookup' },
            { from: '+123', body: 'josianeyoussef' },
        ])

        // Verify conversation
        expect(conversation).toHaveLength(3)

        // Help response
        expect(conversation[0].lastMessage?.text).toContain('Available commands')

        // Lookup prompt
        expect(conversation[1].lastMessage?.text).toContain('What customer')

        // Customer info
        expect(conversation[2].lastMessage?.text).toContain('Josiane Youssef')
        expect(conversation[2].lastMessage?.text).toContain('🟢 Online')
        expect(conversation[2].lastMessage?.text).toContain('+961 71 534 710')

        // Verify service calls
        expect(mockISP.searchCustomerCalls).toHaveLength(1)
    })
})
