import { personalityRepository } from '~/database/repositories/personalityRepository'
import { CreatePersonality, UpdatePersonality, ContextType } from '~/database/schemas/personality'

export class PersonalityService {
    /**
     * Get personality for a context
     */
    async getPersonality(contextId: string) {
        return await personalityRepository.getByContextId(contextId)
    }

    /**
     * Check if a context has a personality configured
     */
    async hasPersonality(contextId: string): Promise<boolean> {
        return await personalityRepository.exists(contextId)
    }

    /**
     * Create a new personality
     */
    async createPersonality(data: CreatePersonality) {
        return await personalityRepository.create(data)
    }

    /**
     * Update an existing personality
     */
    async updatePersonality(contextId: string, data: UpdatePersonality) {
        return await personalityRepository.update(contextId, data)
    }

    /**
     * Delete a personality
     */
    async deletePersonality(contextId: string): Promise<boolean> {
        return await personalityRepository.delete(contextId)
    }

    /**
     * Get context type from message
     */
    getContextType(from: string | number): ContextType {
        // Convert to string if it's a number (Telegram user ID)
        const fromStr = String(from)

        // Telegram user IDs are numbers (private) or negative numbers (groups)
        if (fromStr.startsWith('-')) {
            // Telegram groups have negative IDs
            return 'group'
        } else {
            return 'private'
        }
    }

    /**
     * Extract context ID from the from field
     */
    getContextId(from: string | number): string {
        // Convert to string to handle Telegram user IDs (numbers)
        return String(from)
    }
}

// Export singleton instance
export const personalityService = new PersonalityService()
