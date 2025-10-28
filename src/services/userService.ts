import { userIdentifierRepository } from '~/database/repositories/userIdentifierRepository'
import { CreateUserIdentifier } from '~/database/schemas/userIdentifiers'
import { createFlowLogger } from '~/utils/logger'

const flowLogger = createFlowLogger('user-service')

export class UserService {
    /**
     * Extract user information from Telegram context and store mapping
     */
    async extractAndStoreUserMapping(ctx: any): Promise<void> {
        try {
            const telegramId = String(ctx.from) // Ensure it's a string

            
            // Extract user information from Telegram message context
            const telegramUser = ctx.messageCtx?.update?.message?.from || {}
            let username = telegramUser.username || null
            const firstName = telegramUser.first_name || null
            const lastName = telegramUser.last_name || null

            // Always store username without @ prefix for consistency
            if (username && username.startsWith('@')) {
                username = username.substring(1)
            }

            // Extract from context fields
            const displayName = ctx.name || null
            const pushName = ctx.pushName || null

            // Only proceed if we have at least the telegram ID
            if (!telegramId) {
                flowLogger.warn({ ctx }, 'No telegram_id found in context')
                return
            }

            // Create user identifier data
            const userData: CreateUserIdentifier = {
                telegram_id: telegramId,
                username: username,
                first_name: firstName,
                last_name: lastName,
                display_name: displayName,
                push_name: pushName,
            }

            // Store/upsert user mapping
            const existingUser = await userIdentifierRepository.findByTelegramId(telegramId)

            if (existingUser) {
                // Update existing user with new information
                await userIdentifierRepository.update(telegramId, userData)
                flowLogger.debug({
                    telegramId,
                    username,
                    firstName,
                    lastName,
                    displayName,
                    action: 'updated'
                }, 'User identifier updated')
            } else {
                // Create new user mapping
                await userIdentifierRepository.upsert(userData)
                flowLogger.info({
                    telegramId,
                    username,
                    firstName,
                    lastName,
                    displayName,
                    action: 'created'
                }, 'New user identifier created')
            }

        } catch (error) {
            flowLogger.error({ err: error, ctx }, 'Failed to extract/store user mapping')
        }
    }

    /**
     * Get user identifier by telegram ID
     */
    async getUserByTelegramId(telegramId: string) {
        return await userIdentifierRepository.findByTelegramId(telegramId)
    }

    /**
     * Get user identifier by username
     */
    async getUserByUsername(username: string) {
        return await userIdentifierRepository.findByUsername(username)
    }

    /**
     * Get username for a telegram ID
     */
    async getUsernameForTelegramId(telegramId: string): Promise<string | null> {
        const user = await userIdentifierRepository.findByTelegramId(telegramId)
        return user?.username || null
    }

    /**
     * Get telegram ID for a username
     */
    async getTelegramIdForUsername(username: string): Promise<string | null> {
        const user = await userIdentifierRepository.findByUsername(username)
        return user?.telegram_id || null
    }

    /**
     * Check if a user identifier (either telegram ID or username) matches a stored user
     */
    async findUserByIdentifier(identifier: string): Promise<string | null> {
        try {
            // First, try direct telegram ID match
            const userByTelegramId = await userIdentifierRepository.findByTelegramId(identifier)
            if (userByTelegramId) {
                return userByTelegramId.telegram_id
            }

            // If not found, try username match (remove @ if present)
            const cleanUsername = identifier.startsWith('@') ? identifier.substring(1) : identifier
            const userByUsername = await userIdentifierRepository.findByUsername(cleanUsername)
            if (userByUsername) {
                return userByUsername.telegram_id
            }

            // If still not found, it might be a phone number (for compatibility)
            // Return as-is to let the whitelist system handle it
            return null

        } catch (error) {
            flowLogger.error({ err: error, identifier }, 'Failed to find user by identifier')
            return null
        }
    }

    /**
     * Search users by name or username
     */
    async searchUsers(query: string, limit = 50) {
        return await userIdentifierRepository.search(query, limit)
    }

    /**
     * Get all users
     */
    async getAllUsers(limit = 100) {
        return await userIdentifierRepository.getAll(limit)
    }
}

// Export singleton instance
export const userService = new UserService()