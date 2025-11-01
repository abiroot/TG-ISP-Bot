/**
 * User Management Service (v2)
 *
 * Consolidated service that merges:
 * - personalityService.ts
 * - whitelistService.ts
 * - userService.ts
 *
 * Handles:
 * - Personality management (bot configuration per context)
 * - Whitelist management (access control)
 * - User data management (GDPR, data deletion)
 *
 * Benefits:
 * - Single source of truth for user-related operations
 * - Better transaction support
 * - Clearer responsibility boundaries
 */

import { pool } from '~/config/database'
import { personalityRepository } from '~/database/repositories/personalityRepository'
import { whitelistRepository } from '~/database/repositories/whitelistRepository'
import { messageRepository } from '~/database/repositories/messageRepository'
import { embeddingRepository } from '~/database/repositories/embeddingRepository'
import { telegramUserRepository } from '~/database/repositories/telegramUserRepository'
import { toolExecutionAuditRepository } from '~/database/repositories/toolExecutionAuditRepository'
import { admins } from '~/config/admins'
import { createFlowLogger } from '~/core/utils/logger'
import { ServiceError } from '~/core/errors/ServiceError'
import { getContextId, getContextType } from '~/core/utils/contextId'
import type { Personality, CreatePersonality, UpdatePersonality, ContextType } from '~/database/schemas/personality'

const userMgmtLogger = createFlowLogger('user-management')

/**
 * User Management Service Error with structured error codes
 */
export class UserManagementServiceError extends ServiceError {
    constructor(message: string, code: string, cause?: unknown, retryable: boolean = false) {
        super('UserManagementService', message, code, cause, retryable)
    }
}

/**
 * User Management Service
 *
 * Centralized service for all user-related operations
 */
export class UserManagementService {
    /**
     * PERSONALITY MANAGEMENT
     */

    /**
     * Get personality for a context
     */
    async getPersonality(contextId: string): Promise<Personality | null> {
        try {
            return await personalityRepository.getByContextId(contextId)
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId }, 'Failed to get personality')
            throw new UserManagementServiceError(
                'Failed to retrieve personality',
                'PERSONALITY_FETCH_ERROR',
                error,
                true // Database errors may be transient
            )
        }
    }

    /**
     * Create personality for a context
     */
    async createPersonality(data: CreatePersonality): Promise<Personality> {
        try {
            const personality = await personalityRepository.create(data)
            userMgmtLogger.info({ contextId: data.context_id }, 'Personality created')
            return personality
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId: data.context_id }, 'Failed to create personality')
            throw new UserManagementServiceError(
                'Failed to create personality',
                'PERSONALITY_CREATE_ERROR',
                error,
                true // Database errors may be transient
            )
        }
    }

    /**
     * Upsert personality (create or update)
     * If personality exists, updates it. If not, creates new one.
     */
    async upsertPersonality(data: CreatePersonality): Promise<Personality> {
        try {
            const existing = await personalityRepository.getByContextId(data.context_id)

            if (existing) {
                // Update existing personality
                const updated = await personalityRepository.update(data.context_id, {
                    bot_name: data.bot_name,
                })
                userMgmtLogger.info({ contextId: data.context_id }, 'Personality updated')
                return updated!
            } else {
                // Create new personality
                const personality = await personalityRepository.create(data)
                userMgmtLogger.info({ contextId: data.context_id }, 'Personality created')
                return personality
            }
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId: data.context_id }, 'Failed to upsert personality')
            throw new UserManagementServiceError(
                'Failed to upsert personality',
                'PERSONALITY_UPSERT_ERROR',
                error,
                true // Database errors may be transient
            )
        }
    }

    /**
     * Update personality for a context
     */
    async updatePersonality(contextId: string, updates: UpdatePersonality): Promise<Personality | null> {
        try {
            const personality = await personalityRepository.update(contextId, updates)
            userMgmtLogger.info({ contextId }, 'Personality updated')
            return personality
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId }, 'Failed to update personality')
            throw new UserManagementServiceError(
                'Failed to update personality',
                'PERSONALITY_UPDATE_ERROR',
                error,
                true // Database errors may be transient
            )
        }
    }

    /**
     * Delete personality for a context
     */
    async deletePersonality(contextId: string): Promise<boolean> {
        try {
            const personality = await personalityRepository.getByContextId(contextId)
            if (!personality) return false

            const deleted = await personalityRepository.delete(personality.id)
            userMgmtLogger.info({ contextId }, 'Personality deleted')
            return deleted
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId }, 'Failed to delete personality')
            throw new UserManagementServiceError(
                'Failed to delete personality',
                'PERSONALITY_DELETE_ERROR',
                error,
                true // Database errors may be transient
            )
        }
    }

    /**
     * WHITELIST MANAGEMENT
     */

    /**
     * Check if a user/group is whitelisted
     */
    async isWhitelisted(from: string | number): Promise<boolean> {
        try {
            // Convert to string if number
            const fromStr = String(from)

            // Check if it's a group (starts with -)
            const isGroup = fromStr.startsWith('-')

            if (isGroup) {
                return await whitelistRepository.isGroupWhitelisted(fromStr)
            } else {
                return await whitelistRepository.isUserWhitelisted(fromStr)
            }
        } catch (error) {
            userMgmtLogger.error({ err: error, from }, 'Failed to check whitelist')
            // Return false on error rather than throwing (fail open for better UX)
            return false
        }
    }

    /**
     * Whitelist a group
     */
    async whitelistGroup(groupId: string, whitelistedBy: string, notes?: string): Promise<void> {
        try {
            await whitelistRepository.addGroup({ group_id: groupId, whitelisted_by: whitelistedBy, notes })
            userMgmtLogger.info({ groupId, whitelistedBy }, 'Group whitelisted')
        } catch (error) {
            userMgmtLogger.error({ err: error, groupId }, 'Failed to whitelist group')
            throw error
        }
    }

    /**
     * Whitelist a user
     */
    async whitelistUser(userIdentifier: string, whitelistedBy: string, notes?: string): Promise<void> {
        try {
            await whitelistRepository.addUser({ user_identifier: userIdentifier, whitelisted_by: whitelistedBy, notes })
            userMgmtLogger.info({ userIdentifier, whitelistedBy }, 'User whitelisted')
        } catch (error) {
            userMgmtLogger.error({ err: error, userIdentifier }, 'Failed to whitelist user')
            throw error
        }
    }

    /**
     * Remove group from whitelist
     */
    async removeGroupFromWhitelist(groupId: string): Promise<boolean> {
        try {
            const removed = await whitelistRepository.removeGroup(groupId)
            userMgmtLogger.info({ groupId, removed }, 'Group removed from whitelist')
            return removed
        } catch (error) {
            userMgmtLogger.error({ err: error, groupId }, 'Failed to remove group')
            throw error
        }
    }

    /**
     * Remove user from whitelist
     */
    async removeUserFromWhitelist(userIdentifier: string): Promise<boolean> {
        try {
            const removed = await whitelistRepository.removeUser(userIdentifier)
            userMgmtLogger.info({ userIdentifier, removed }, 'User removed from whitelist')
            return removed
        } catch (error) {
            userMgmtLogger.error({ err: error, userIdentifier }, 'Failed to remove user')
            throw error
        }
    }

    /**
     * Get all whitelisted groups
     */
    async getWhitelistedGroups() {
        try {
            return await whitelistRepository.getAllGroups()
        } catch (error) {
            userMgmtLogger.error({ err: error }, 'Failed to get whitelisted groups')
            throw error
        }
    }

    /**
     * Get all whitelisted users
     */
    async getWhitelistedUsers() {
        try {
            return await whitelistRepository.getAllUsers()
        } catch (error) {
            userMgmtLogger.error({ err: error }, 'Failed to get whitelisted users')
            throw error
        }
    }

    /**
     * ADMIN MANAGEMENT
     */

    /**
     * Check if user is admin
     */
    isAdmin(userIdentifier: string | number): boolean {
        // Convert to string if number
        const userIdStr = String(userIdentifier)
        return admins.includes(userIdStr)
    }

    /**
     * Get all admin user identifiers
     */
    getAdmins(): string[] {
        return [...admins]
    }

    /**
     * USER DATA MANAGEMENT (GDPR)
     */

    /**
     * Delete all user data (GDPR compliance)
     * Deletes: messages, embeddings, personality, user mapping, tool audit logs, whitelist entry
     */
    async deleteAllUserData(userIdentifier: string): Promise<{
        messagesDeleted: number
        embeddingsDeleted: number
        personalityDeleted: boolean
        userMappingDeleted: boolean
        auditLogsDeleted: number
        whitelistDeleted: boolean
    }> {
        try {
            userMgmtLogger.info({ userIdentifier }, 'Starting complete user data deletion')

            // Delete messages
            const messagesDeleted = await messageRepository.deleteByUser(userIdentifier)

            // Delete embeddings
            const contextId = getContextId(userIdentifier)
            const embeddingsDeleted = await embeddingRepository.deleteByContextId(contextId)

            // Delete personality
            const personalityDeleted = await this.deletePersonality(contextId)

            // Delete telegram user mapping (GDPR compliance)
            const userMappingDeleted = await telegramUserRepository.deleteByTelegramId(userIdentifier)

            // Delete tool execution audit logs (GDPR compliance)
            const auditLogsDeleted = await toolExecutionAuditRepository.deleteByUser(userIdentifier)

            // Delete from whitelist if present
            const whitelistDeleted = await whitelistRepository.removeUser(userIdentifier)

            const result = {
                messagesDeleted,
                embeddingsDeleted,
                personalityDeleted,
                userMappingDeleted,
                auditLogsDeleted,
                whitelistDeleted,
            }

            userMgmtLogger.info({ userIdentifier, result }, 'User data deletion completed')

            return result
        } catch (error) {
            userMgmtLogger.error({ err: error, userIdentifier }, 'Failed to delete user data')
            throw new UserManagementServiceError(
                'Failed to delete user data (GDPR)',
                'USER_DATA_DELETE_ERROR',
                error,
                false // GDPR deletions should not auto-retry
            )
        }
    }

    /**
     * Delete conversation history for a context (keeps personality)
     */
    async deleteConversationHistory(contextId: string): Promise<{
        messagesDeleted: number
        embeddingsDeleted: number
    }> {
        try {
            userMgmtLogger.info({ contextId }, 'Starting conversation history deletion')

            const messagesDeleted = await messageRepository.deleteByContextId(contextId)
            const embeddingsDeleted = await embeddingRepository.deleteByContextId(contextId)

            const result = { messagesDeleted, embeddingsDeleted }

            userMgmtLogger.info({ contextId, result }, 'Conversation history deletion completed')

            return result
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId }, 'Failed to delete conversation history')
            throw error
        }
    }

    /**
     * Get user data statistics
     */
    async getUserDataStats(contextId: string): Promise<{
        messageCount: number
        embeddingCount: number
        hasPersonality: boolean
        isWhitelisted: boolean
        isAdmin: boolean
    }> {
        try {
            const [messageCount, embeddingStats, personality, isWhitelisted] = await Promise.all([
                messageRepository.getMessageCount(contextId),
                embeddingRepository.getStats(contextId),
                personalityRepository.getByContextId(contextId),
                this.isWhitelisted(contextId),
            ])

            return {
                messageCount,
                embeddingCount: embeddingStats.total_chunks,
                hasPersonality: !!personality,
                isWhitelisted,
                isAdmin: this.isAdmin(contextId),
            }
        } catch (error) {
            userMgmtLogger.error({ err: error, contextId }, 'Failed to get user data stats')
            throw error
        }
    }
}

/**
 * Singleton instance
 */
export const userManagementService = new UserManagementService()
