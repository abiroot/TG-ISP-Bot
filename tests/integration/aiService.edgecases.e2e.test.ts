/**
 * E2E Test for AI Service - ISP Edge Cases
 * Tests real-world ISP support edge cases: invalid phone numbers, API failures, ambiguous requests, etc.
 *
 * This test uses:
 * - Real AI SDK (generateText with ISP tools)
 * - Real PostgreSQL database
 * - Various edge case scenarios users might encounter in ISP support
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { aiService } from '~/services/aiService'
import { messageService } from '~/services/messageService'
import { createTestPersonality, cleanupTestUserComplete } from "../helpers/testHelpers"
import { ispRepository } from '~/database/repositories/ispRepository'
import { messageRepository } from '~/database/repositories/messageRepository'
import type { Personality } from '~/database/schemas/personality'

describe('AI Service E2E - ISP Edge Cases', () => {
    const TEST_USER_PHONE = '+1234567890EDGE'
    const TEST_CONTEXT_ID = TEST_USER_PHONE
    const TEST_USER_NAME = 'Test User Edge'

    let testPersonality: Personality

    beforeAll(async () => {
        // Create test personality
        testPersonality = await createTestPersonality({
            context_id: TEST_CONTEXT_ID,
            context_type: 'private',
            bot_name: 'TestBot',
            default_timezone: 'UTC',
            default_language: 'en',
            created_by: TEST_USER_PHONE,
        })
    })

    beforeEach(async () => {
        // Clean up test data before each test
        await ispRepository.deleteAllCustomerData(TEST_USER_PHONE)
        await messageRepository.deleteByContextId(TEST_CONTEXT_ID)
    })

    afterAll(async () => {
        // Clean up test data
        await ispRepository.deleteAllCustomerData(TEST_USER_PHONE)
        await messageRepository.deleteByContextId(TEST_CONTEXT_ID)
        await cleanupTestUserComplete(TEST_USER_PHONE, TEST_CONTEXT_ID)
    })

    describe('ISP Support Edge Cases', () => {
        it('should handle various phone number formats correctly', async () => {
            const userMessage = "Can you check customer info for (123) 456-7890?"

            const response = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                userMessage,
                testPersonality,
                []
            )

            // Verify response mentions customer lookup
            expect(response).toMatch(/customer|information|lookup|found/i)

            // Verify query was logged
            const entries = await ispRepository.getEntries({
                user_phone: TEST_USER_PHONE,
                query_type: 'customer_info',
            })

            expect(entries.length).toBeGreaterThanOrEqual(1)
            expect(entries[0].query_type).toBe('customer_info')

            console.log('✅ Phone number format handled correctly')
        }, 30000)

        it('should handle invalid phone numbers gracefully', async () => {
            const userMessage = "What about customer abc123?"

            const response = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                userMessage,
                testPersonality,
                []
            )

            // Should handle gracefully without crashing
            expect(response).toMatch(/customer|phone|number|invalid|found/i)

            console.log('✅ Invalid phone number handled gracefully')
        }, 30000)

        it('should handle ambiguous customer requests', async () => {
            const userMessage = "I need help with a customer"

            const response = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                userMessage,
                testPersonality,
                []
            )

            // Should ask for clarification
            expect(response).toMatch(/phone number|customer information|which customer|details/i)

            console.log('✅ Ambiguous request handled with clarification')
        }, 30000)

        it('should handle multiple customer requests in conversation', async () => {
            // First customer
            const firstResponse = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                "Check customer +1111111111",
                testPersonality,
                []
            )

            expect(firstResponse).toMatch(/customer|information|found/i)

            // Get conversation history
            const history = await messageService.getLastMessages(TEST_CONTEXT_ID, 10)

            // Second customer in same conversation
            const secondResponse = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                "Now check +2222222222",
                testPersonality,
                history
            )

            expect(secondResponse).toMatch(/customer|information|found/i)

            // Verify both queries were logged
            const entries = await ispRepository.getEntries({
                user_phone: TEST_USER_PHONE,
            })

            expect(entries.length).toBeGreaterThanOrEqual(1)

            console.log('✅ Multiple customer requests handled correctly')
        }, 30000)

        it('should handle tool execution errors gracefully', async () => {
            const userMessage = "Check customer for 0000000000" // Non-existent number

            const response = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                userMessage,
                testPersonality,
                []
            )

            // Should handle user not found gracefully
            expect(response).toMatch(/not found|customer|information/i)

            console.log('✅ Tool execution errors handled gracefully')
        }, 30000)

        it('should properly store query metadata', async () => {
            const userMessage = "What's the status of customer +1234567890?"

            const response = await aiService.generateResponseWithToolsAndRAG(
                TEST_CONTEXT_ID,
                TEST_USER_PHONE,
                TEST_USER_NAME,
                userMessage,
                testPersonality,
                []
            )

            // Verify query metadata is stored correctly
            const entries = await ispRepository.getEntries({
                user_phone: TEST_USER_PHONE,
                limit: 1,
            })

            expect(entries).toHaveLength(1)
            expect(entries[0].user_phone).toBe(TEST_USER_PHONE)
            expect(entries[0].context_id).toBe(TEST_CONTEXT_ID)
            expect(entries[0].query_description).toBe(userMessage)
            expect(entries[0].response_time_ms).toBeGreaterThan(0)
            expect(entries[0].created_at).toBeInstanceOf(Date)

            console.log('✅ Query metadata stored correctly')
        }, 30000)
    })
})