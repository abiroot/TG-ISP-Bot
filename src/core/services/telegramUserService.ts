/**
 * Telegram User Service
 *
 * Handles username -> Telegram ID mapping for webhook notifications
 * Auto-captures user data from bot interactions
 */

import { telegramUserRepository } from '~/database/repositories/telegramUserRepository'
import { createFlowLogger } from '~/core/utils/logger'
import type {
    TelegramUserMapping,
    CreateTelegramUserMapping,
    UpdateTelegramUserMapping,
} from '~/database/schemas/telegramUserMapping'

const logger = createFlowLogger('telegram-user-service')

/**
 * Telegram User Service Error
 */
export class TelegramUserServiceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: unknown,
        public readonly retryable: boolean = false
    ) {
        super(message)
        this.name = 'TelegramUserServiceError'
    }
}

/**
 * Telegram User Service
 */
export class TelegramUserService {
    /**
     * Get Telegram ID by username (primary use case for webhook)
     */
    async getTelegramIdByUsername(username: string): Promise<string | null> {
        try {
            // Validate username
            if (!username || typeof username !== 'string' || username.trim() === '') {
                throw new TelegramUserServiceError(
                    'Invalid username provided',
                    'INVALID_USERNAME',
                    undefined,
                    false
                )
            }

            const telegramId = await telegramUserRepository.getTelegramIdByUsername(username.trim())
            logger.debug({ username, telegramId }, 'Username lookup')
            return telegramId
        } catch (error) {
            if (error instanceof TelegramUserServiceError) {
                throw error
            }
            logger.error({ err: error, username }, 'Failed to get Telegram ID by username')
            throw new TelegramUserServiceError(
                'Failed to lookup Telegram ID',
                'TELEGRAM_ID_LOOKUP_ERROR',
                error,
                true // Database errors may be transient
            )
        }
    }

    /**
     * Get full user mapping by username
     */
    async getUserByUsername(username: string): Promise<TelegramUserMapping | null> {
        try {
            return await telegramUserRepository.getUserByUsername(username.trim())
        } catch (error) {
            logger.error({ err: error, username }, 'Failed to get user by username')
            throw new TelegramUserServiceError(
                'Failed to get user mapping',
                'USER_LOOKUP_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Get full user mapping by Telegram ID
     */
    async getUserByTelegramId(telegramId: string): Promise<TelegramUserMapping | null> {
        try {
            return await telegramUserRepository.getUserByTelegramId(telegramId)
        } catch (error) {
            logger.error({ err: error, telegramId }, 'Failed to get user by Telegram ID')
            throw new TelegramUserServiceError(
                'Failed to get user mapping',
                'USER_LOOKUP_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Upsert user mapping (used by auto-capture middleware)
     */
    async upsertUser(data: CreateTelegramUserMapping): Promise<TelegramUserMapping> {
        try {
            // Validate required fields
            if (!data.username || !data.telegram_id) {
                throw new TelegramUserServiceError(
                    'Username and telegram_id are required',
                    'INVALID_USER_DATA',
                    undefined,
                    false
                )
            }

            const user = await telegramUserRepository.upsertUser(data)
            logger.info({ username: data.username, telegramId: data.telegram_id }, 'User mapping upserted')
            return user
        } catch (error) {
            if (error instanceof TelegramUserServiceError) {
                throw error
            }
            logger.error({ err: error, data }, 'Failed to upsert user mapping')
            throw new TelegramUserServiceError(
                'Failed to store user mapping',
                'USER_UPSERT_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Update user mapping
     */
    async updateUser(
        username: string,
        updates: UpdateTelegramUserMapping
    ): Promise<TelegramUserMapping | null> {
        try {
            const user = await telegramUserRepository.updateUser(username, updates)
            if (user) {
                logger.info({ username }, 'User mapping updated')
            }
            return user
        } catch (error) {
            logger.error({ err: error, username }, 'Failed to update user mapping')
            throw new TelegramUserServiceError(
                'Failed to update user mapping',
                'USER_UPDATE_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Get all user mappings
     */
    async getAllUsers(): Promise<TelegramUserMapping[]> {
        try {
            return await telegramUserRepository.getAllUsers()
        } catch (error) {
            logger.error({ err: error }, 'Failed to get all users')
            throw new TelegramUserServiceError(
                'Failed to get all users',
                'USER_LIST_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Delete user mapping
     */
    async deleteUser(username: string): Promise<boolean> {
        try {
            const deleted = await telegramUserRepository.deleteUser(username)
            logger.info({ username, deleted }, 'User mapping deletion attempted')
            return deleted
        } catch (error) {
            logger.error({ err: error, username }, 'Failed to delete user mapping')
            throw new TelegramUserServiceError(
                'Failed to delete user mapping',
                'USER_DELETE_ERROR',
                error,
                true
            )
        }
    }

    /**
     * Check if username exists
     */
    async usernameExists(username: string): Promise<boolean> {
        try {
            return await telegramUserRepository.usernameExists(username.trim())
        } catch (error) {
            logger.error({ err: error, username }, 'Failed to check username existence')
            throw new TelegramUserServiceError(
                'Failed to check username',
                'USERNAME_CHECK_ERROR',
                error,
                true
            )
        }
    }
}

/**
 * Singleton instance
 */
export const telegramUserService = new TelegramUserService()
