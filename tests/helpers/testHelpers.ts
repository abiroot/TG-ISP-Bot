/**
 * Test Helper Functions
 * Reusable utilities for E2E tests
 */
import { personalityService } from '~/services/personalityService'
import { messageRepository } from '~/database/repositories/messageRepository'
import { ispRepository } from '~/database/repositories/ispRepository'
import type { CreatePersonality, Personality } from '~/database/schemas/personality'

/**
 * Create or recreate a test personality (deletes existing first)
 * This prevents duplicate key violations when tests run in parallel
 */
export async function createTestPersonality(data: CreatePersonality): Promise<Personality> {
    // Delete if exists
    await personalityService.deletePersonality(data.context_id)

    // Create fresh personality
    return await personalityService.createPersonality(data)
}

/**
 * Clean up all test data for a user
 */
export async function cleanupTestUser(userPhone: string, contextId: string): Promise<void> {
    await ispRepository.deleteAllCustomerData(userPhone)
    await messageRepository.deleteByContextId(contextId)
}

/**
 * Clean up everything including personality
 */
export async function cleanupTestUserComplete(userPhone: string, contextId: string): Promise<void> {
    await cleanupTestUser(userPhone, contextId)
    await personalityService.deletePersonality(contextId)
}
