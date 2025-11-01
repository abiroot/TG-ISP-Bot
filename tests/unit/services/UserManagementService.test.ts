/**
 * User Management Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserManagementService } from '~/features/admin/services/UserManagementService'

// Mock repositories
vi.mock('~/database/repositories/personalityRepository', () => ({
    personalityRepository: {
        getByContextId: vi.fn(),
        create: vi.fn(),
        updateByContextId: vi.fn(),
        delete: vi.fn(),
    },
}))

vi.mock('~/database/repositories/whitelistRepository', () => ({
    whitelistRepository: {
        isGroupWhitelisted: vi.fn(),
        isNumberWhitelisted: vi.fn(),
        whitelistGroup: vi.fn(),
        whitelistNumber: vi.fn(),
        removeGroup: vi.fn(),
        removeNumber: vi.fn(),
        getAllGroups: vi.fn().mockResolvedValue([]),
        getAllNumbers: vi.fn().mockResolvedValue([]),
    },
}))

vi.mock('~/database/repositories/messageRepository', () => ({
    messageRepository: {
        deleteByUser: vi.fn().mockResolvedValue(10),
        deleteByContextId: vi.fn().mockResolvedValue(5),
        getMessageCount: vi.fn().mockResolvedValue(100),
    },
}))

vi.mock('~/database/repositories/embeddingRepository', () => ({
    embeddingRepository: {
        deleteByContextId: vi.fn().mockResolvedValue(3),
        getStats: vi.fn().mockResolvedValue({ total_chunks: 5 }),
    },
}))

describe('UserManagementService', () => {
    let userMgmtService: UserManagementService

    beforeEach(() => {
        userMgmtService = new UserManagementService()
        vi.clearAllMocks()
    })

    describe('Personality Management', () => {
        it('should get context ID from phone', () => {
            const contextId = userMgmtService.getContextId('+1234567890')

            expect(contextId).toBe('+1234567890')
        })

        it('should get personality for context', async () => {
            const mockPersonality = {
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
            }

            const { personalityRepository } = await import('~/database/repositories/personalityRepository')
            vi.mocked(personalityRepository.getByContextId).mockResolvedValue(mockPersonality as any)

            const personality = await userMgmtService.getPersonality('test-context')

            expect(personality).toEqual(mockPersonality)
            expect(personalityRepository.getByContextId).toHaveBeenCalledWith('test-context')
        })

        it('should create new personality', async () => {
            const newPersonality = {
                context_id: 'test-context',
                context_type: 'private' as const,
                bot_name: 'New Bot',
                default_currency: 'USD',
                default_timezone: 'UTC',
                default_language: 'en',
                created_by: 'admin',
            }

            const { personalityRepository } = await import('~/database/repositories/personalityRepository')
            vi.mocked(personalityRepository.create).mockResolvedValue({
                ...newPersonality,
                id: '1',
                created_at: new Date(),
                updated_at: new Date(),
            } as any)

            const personality = await userMgmtService.createPersonality(newPersonality)

            expect(personality).toBeDefined()
            expect(personalityRepository.create).toHaveBeenCalledWith(newPersonality)
        })

        it('should update personality', async () => {
            const updates = { bot_name: 'Updated Bot' }

            const { personalityRepository } = await import('~/database/repositories/personalityRepository')
            vi.mocked(personalityRepository.updateByContextId).mockResolvedValue({
                id: '1',
                context_id: 'test-context',
                ...updates,
            } as any)

            await userMgmtService.updatePersonality('test-context', updates)

            expect(personalityRepository.updateByContextId).toHaveBeenCalledWith('test-context', updates)
        })

        it('should delete personality', async () => {
            const { personalityRepository } = await import('~/database/repositories/personalityRepository')
            vi.mocked(personalityRepository.getByContextId).mockResolvedValue({ id: '1' } as any)
            vi.mocked(personalityRepository.delete).mockResolvedValue(true)

            const deleted = await userMgmtService.deletePersonality('test-context')

            expect(deleted).toBe(true)
        })
    })

    describe('Whitelist Management', () => {
        it('should check if user is whitelisted', async () => {
            const { whitelistRepository } = await import('~/database/repositories/whitelistRepository')
            vi.mocked(whitelistRepository.isNumberWhitelisted).mockResolvedValue(true)

            const isWhitelisted = await userMgmtService.isWhitelisted('+1234567890')

            expect(isWhitelisted).toBe(true)
        })

        it('should check if group is whitelisted', async () => {
            const { whitelistRepository } = await import('~/database/repositories/whitelistRepository')
            vi.mocked(whitelistRepository.isGroupWhitelisted).mockResolvedValue(true)

            const isWhitelisted = await userMgmtService.isWhitelisted('-123456789')

            expect(isWhitelisted).toBe(true)
        })

        it('should whitelist a user', async () => {
            const { whitelistRepository } = await import('~/database/repositories/whitelistRepository')

            await userMgmtService.whitelistUser('+1234567890', 'admin', 'Test note')

            expect(whitelistRepository.whitelistNumber).toHaveBeenCalledWith(
                '+1234567890',
                'admin',
                'Test note'
            )
        })

        it('should whitelist a group', async () => {
            const { whitelistRepository } = await import('~/database/repositories/whitelistRepository')

            await userMgmtService.whitelistGroup('-123456789', 'admin', 'Test group')

            expect(whitelistRepository.whitelistGroup).toHaveBeenCalledWith(
                '-123456789',
                'admin',
                'Test group'
            )
        })

        it('should remove user from whitelist', async () => {
            const { whitelistRepository } = await import('~/database/repositories/whitelistRepository')
            vi.mocked(whitelistRepository.removeNumber).mockResolvedValue(true)

            const removed = await userMgmtService.removeUserFromWhitelist('+1234567890')

            expect(removed).toBe(true)
        })

        it('should remove group from whitelist', async () => {
            const { whitelistRepository } = await import('~/database/repositories/whitelistRepository')
            vi.mocked(whitelistRepository.removeGroup).mockResolvedValue(true)

            const removed = await userMgmtService.removeGroupFromWhitelist('-123456789')

            expect(removed).toBe(true)
        })
    })

    describe('Admin Management', () => {
        it('should check if user is admin', () => {
            // Assumes admins array includes test admin
            const isAdmin = userMgmtService.isAdmin('test-admin')

            expect(typeof isAdmin).toBe('boolean')
        })

        it('should get all admins', () => {
            const admins = userMgmtService.getAdmins()

            expect(Array.isArray(admins)).toBe(true)
        })
    })

    describe('User Data Management (GDPR)', () => {
        it('should delete all user data', async () => {
            const result = await userMgmtService.deleteAllUserData('+1234567890')

            expect(result).toBeDefined()
            expect(result.messagesDeleted).toBeGreaterThan(0)
            expect(result.embeddingsDeleted).toBeGreaterThan(0)
            expect(typeof result.personalityDeleted).toBe('boolean')
        })

        it('should delete conversation history', async () => {
            const result = await userMgmtService.deleteConversationHistory('test-context')

            expect(result).toBeDefined()
            expect(result.messagesDeleted).toBeGreaterThan(0)
            expect(result.embeddingsDeleted).toBeGreaterThan(0)
        })

        it('should get user data statistics', async () => {
            const { personalityRepository } = await import('~/database/repositories/personalityRepository')
            vi.mocked(personalityRepository.getByContextId).mockResolvedValue({ id: '1' } as any)

            const stats = await userMgmtService.getUserDataStats('test-context')

            expect(stats).toBeDefined()
            expect(stats.messageCount).toBeDefined()
            expect(stats.embeddingCount).toBeDefined()
            expect(stats.hasPersonality).toBe(true)
            expect(typeof stats.isWhitelisted).toBe('boolean')
            expect(typeof stats.isAdmin).toBe('boolean')
        })
    })
})
