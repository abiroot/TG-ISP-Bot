/**
 * Infrastructure Test
 *
 * Verifies the e2e testing infrastructure is working correctly
 */

import { describe, it, expect } from 'vitest'
import { createMockISPService } from '../utils/MockISPService.js'
import { createMockDatabase } from '../utils/MockDatabase.js'
import { createMockTelegramProvider } from '../utils/MockTelegramProvider.js'
import { onlineCustomer, offlineCustomer, expiredCustomer } from '../fixtures/ispCustomerData.js'
import { testPersonality, privatePersonality } from '../fixtures/personalities.js'

describe('E2E Infrastructure', () => {
    describe('MockISPService', () => {
        it('should return online customer by username', async () => {
            const mockISP = createMockISPService()

            const results = await mockISP.searchCustomer('josianeyoussef')

            expect(results).toHaveLength(1)
            expect(results[0].firstName).toBe('Josiane')
            expect(results[0].lastName).toBe('Youssef')
            expect(results[0].online).toBe(true)
            expect(results[0].mobile).toBe('+961 71 534 710')
        })

        it('should return offline customer', async () => {
            const mockISP = createMockISPService()

            const results = await mockISP.searchCustomer('customer_offline')

            expect(results).toHaveLength(1)
            expect(results[0].firstName).toBe('Karim')
            expect(results[0].online).toBe(false)
        })

        it('should return empty array for non-existent customer', async () => {
            const mockISP = createMockISPService()

            const results = await mockISP.searchCustomer('nonexistent_user_12345')

            expect(results).toHaveLength(0)
        })

        it('should track search calls', async () => {
            const mockISP = createMockISPService()

            await mockISP.searchCustomer('josianeyoussef')
            await mockISP.searchCustomer('customer_offline')

            expect(mockISP.searchCustomerCalls).toHaveLength(2)
            expect(mockISP.searchCustomerCalls[0].identifier).toBe('josianeyoussef')
            expect(mockISP.searchCustomerCalls[1].identifier).toBe('customer_offline')
        })

        it('should update user location', async () => {
            const mockISP = createMockISPService()

            const result = await mockISP.updateUserLocation('josianeyoussef', 33.8938, 35.5018)

            expect(result.success).toBe(true)
            expect(result.error).toBeUndefined()
        })

        it('should fail to update location for non-existent user', async () => {
            const mockISP = createMockISPService()

            const result = await mockISP.updateUserLocation('nonexistent', 33.8938, 35.5018)

            expect(result.success).toBe(false)
            expect(result.error).toBe('User not found in ISP system')
        })

        it('should provide AI SDK tools', () => {
            const mockISP = createMockISPService()

            const tools = mockISP.getTools()

            expect(tools.searchCustomer).toBeDefined()
            expect(tools.getMikrotikUsers).toBeDefined()
            expect(tools.updateUserLocation).toBeDefined()
            expect(tools.batchUpdateLocations).toBeDefined()
        })
    })

    describe('MockDatabase', () => {
        it('should load fixture personalities', async () => {
            const db = createMockDatabase()

            const personality = await db.personalityRepository.findByContextId('test-context-1')

            expect(personality).toBeDefined()
            expect(personality?.bot_name).toBe('Test Bot')
        })

        it('should create new personality', async () => {
            const db = createMockDatabase()

            const newPersonality = await db.personalityRepository.create({
                context_id: 'new-context',
                context_type: 'private',
                bot_name: 'New Test Bot',
                created_by: 'test',
            })

            expect(newPersonality.id).toBeDefined()
            expect(newPersonality.bot_name).toBe('New Test Bot')
        })

        it('should get conversation history', async () => {
            const db = createMockDatabase()

            const history = await db.messageRepository.getConversationHistory('+1234567890', 10)

            expect(history).toBeDefined()
            expect(Array.isArray(history)).toBe(true)
        })

        it('should whitelist users', async () => {
            const db = createMockDatabase()

            const isWhitelisted = await db.whitelistRepository.isUserWhitelisted('+1234567890')

            expect(isWhitelisted).toBe(true)
        })

        it('should reset to initial state', () => {
            const db = createMockDatabase()

            // Make some changes
            db.personalityRepository.create({
                context_id: 'temp',
                bot_name: 'Temp',
                created_by: 'test',
            })

            // Reset
            db.reset()

            // Should have original fixtures
            expect(db.personalityRepository.findByContextId('test-context-1')).toBeDefined()
        })
    })

    describe('MockTelegramProvider', () => {
        it('should capture sent messages', async () => {
            const provider = createMockTelegramProvider()

            await provider.sendMessage('+123', 'Hello user!')
            await provider.sendMessage('+123', 'How are you?')

            const messages = provider.getAllMessages()

            expect(messages).toHaveLength(2)
            expect(messages[0].text).toBe('Hello user!')
            expect(messages[1].text).toBe('How are you?')
        })

        it('should get last message', async () => {
            const provider = createMockTelegramProvider()

            await provider.sendMessage('+123', 'First')
            await provider.sendMessage('+123', 'Second')

            const last = provider.getLastMessage()

            expect(last?.text).toBe('Second')
        })

        it('should filter messages by chat', async () => {
            const provider = createMockTelegramProvider()

            await provider.sendMessage('+111', 'To user 1')
            await provider.sendMessage('+222', 'To user 2')
            await provider.sendMessage('+111', 'Another to user 1')

            const user1Messages = provider.getMessagesForChat('+111')

            expect(user1Messages).toHaveLength(2)
            expect(user1Messages[0].text).toBe('To user 1')
        })

        it('should emit message events', async () => {
            const provider = createMockTelegramProvider()
            let eventFired = false

            provider.on('message', (ctx) => {
                eventFired = true
                expect(ctx.from).toBe('+123')
                expect(ctx.body).toBe('test')
            })

            await provider.emitMessage({ from: '+123', body: 'test' })

            expect(eventFired).toBe(true)
        })

        it('should reset state', async () => {
            const provider = createMockTelegramProvider()

            await provider.sendMessage('+123', 'Message')
            expect(provider.getAllMessages()).toHaveLength(1)

            provider.reset()

            expect(provider.getAllMessages()).toHaveLength(0)
        })
    })

    describe('Test Fixtures', () => {
        it('should have complete customer data', () => {
            // Verify all required fields are present
            expect(onlineCustomer.id).toBe(1)
            expect(onlineCustomer.userName).toBe('josianeyoussef')
            expect(onlineCustomer.firstName).toBe('Josiane')
            expect(onlineCustomer.lastName).toBe('Youssef')
            expect(onlineCustomer.mobile).toBe('+961 71 534 710')
            expect(onlineCustomer.online).toBe(true)
            expect(onlineCustomer.ipAddress).toBe('10.50.1.45')
            expect(onlineCustomer.accountPrice).toBe(75.0)

            // Verify it has all 51 fields
            const fieldCount = Object.keys(onlineCustomer).length
            expect(fieldCount).toBeGreaterThanOrEqual(51)
        })

        it('should have offline customer data', () => {
            expect(offlineCustomer.online).toBe(false)
            expect(offlineCustomer.userName).toBe('customer_offline')
        })

        it('should have expired customer data', () => {
            expect(expiredCustomer.active).toBe(false)
            expect(expiredCustomer.blocked).toBe(true)
        })

        it('should have personality fixtures', () => {
            expect(testPersonality.bot_name).toBe('Test Bot')
            expect(testPersonality.context_type).toBe('private')

            expect(privatePersonality.bot_name).toBe('ISP Support Assistant')
        })
    })
})
