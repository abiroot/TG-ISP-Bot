/**
 * Telegram User Repository Unit Tests
 * Tests username conflict resolution with number appending
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { TelegramUserRepository } from '~/database/repositories/telegramUserRepository'
import type { CreateTelegramUserMapping } from '~/database/schemas/telegramUserMapping'

// Mock the database pool (must be defined before vi.mock due to hoisting)
vi.mock('~/config/database', () => ({
    pool: {
        query: vi.fn(),
    },
}))

describe('TelegramUserRepository - Username Conflict Resolution', () => {
    let repository: TelegramUserRepository
    let mockQuery: any

    beforeEach(async () => {
        repository = new TelegramUserRepository()

        // Get reference to the mocked query function
        const { pool } = await import('~/config/database')
        mockQuery = pool.query as any

        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('findNextAvailableUsername', () => {
        it('should return base username when no conflicts exist', async () => {
            // Mock: No existing users with similar names
            mockQuery.mockResolvedValueOnce({ rows: [] })

            const result = await repository.findNextAvailableUsername('josiane')

            expect(result).toBe('josiane')
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('WHERE username ~'),
                ['^josiane[0-9]*$']
            )
        })

        it('should return "josiane2" when "josiane" exists', async () => {
            // Mock: Only base username exists
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane' }],
            })

            const result = await repository.findNextAvailableUsername('josiane')

            expect(result).toBe('josiane2')
        })

        it('should return "josiane3" when "josiane" and "josiane2" exist', async () => {
            // Mock: Base username and josiane2 exist
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane2' }, { username: 'josiane' }],
            })

            const result = await repository.findNextAvailableUsername('josiane')

            expect(result).toBe('josiane3')
        })

        it('should find highest number and increment (gaps in numbering)', async () => {
            // Mock: josiane, josiane5 exist (gap at 2, 3, 4)
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane5' }, { username: 'josiane' }],
            })

            const result = await repository.findNextAvailableUsername('josiane')

            // Should return josiane6 (highest + 1), not fill gaps
            expect(result).toBe('josiane6')
        })

        it('should handle only numbered variants (no base username)', async () => {
            // Mock: josiane2, josiane3 exist but NOT josiane
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane3' }, { username: 'josiane2' }],
            })

            const result = await repository.findNextAvailableUsername('josiane')

            expect(result).toBe('josiane4')
        })

        it('should handle large numbers correctly', async () => {
            // Mock: josiane99 exists
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane99' }],
            })

            const result = await repository.findNextAvailableUsername('josiane')

            expect(result).toBe('josiane100')
        })

        it('should handle usernames with underscores', async () => {
            // Mock: user_123456789 exists (fallback username pattern)
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'user_123456789' }],
            })

            const result = await repository.findNextAvailableUsername('user_123456789')

            expect(result).toBe('user_1234567892')
        })
    })

    describe('upsertUser - Conflict Resolution', () => {
        const baseUserData: CreateTelegramUserMapping = {
            username: 'josiane',
            telegram_id: '111111111',
            telegram_username: '@josiane',
            first_name: 'Josiane',
            last_name: 'Youssef',
        }

        it('should insert new user without conflict', async () => {
            // Mock: User doesn't exist by telegram_id
            mockQuery.mockResolvedValueOnce({ rows: [] })

            // Mock: Successful insert
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        id: '1',
                        username: 'josiane',
                        telegram_id: '111111111',
                        telegram_username: '@josiane',
                        first_name: 'Josiane',
                        last_name: 'Youssef',
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            })

            const result = await repository.upsertUser(baseUserData)

            expect(result.username).toBe('josiane')
            expect(result.telegram_id).toBe('111111111')
            expect(mockQuery).toHaveBeenCalledTimes(2) // 1 check + 1 insert
        })

        it('should update existing user by telegram_id (preserves username)', async () => {
            const existingUser = {
                id: '1',
                username: 'josiane',
                telegram_id: '111111111',
                telegram_username: '@josiane_old',
                first_name: 'Josiane',
                last_name: 'Old',
                created_at: new Date(),
                updated_at: new Date(),
            }

            // Mock: User exists by telegram_id
            mockQuery.mockResolvedValueOnce({ rows: [existingUser] })

            // Mock: Update query
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        ...existingUser,
                        telegram_username: '@josiane_new',
                        first_name: 'Josiane Updated',
                        updated_at: new Date(),
                    },
                ],
            })

            const result = await repository.upsertUser({
                ...baseUserData,
                telegram_username: '@josiane_new',
                first_name: 'Josiane Updated',
            })

            expect(result.username).toBe('josiane') // Username preserved
            expect(result.telegram_username).toBe('@josiane_new')
            expect(mockQuery).toHaveBeenCalledTimes(2) // 1 check + 1 update
        })

        it('should handle username conflict and retry with numbered username', async () => {
            const secondUser: CreateTelegramUserMapping = {
                username: 'josiane',
                telegram_id: '222222222', // Different telegram_id
                telegram_username: '@josiane2',
                first_name: 'Josiane',
                last_name: 'Second',
            }

            // Mock: Second user doesn't exist by telegram_id
            mockQuery.mockResolvedValueOnce({ rows: [] })

            // Mock: First insert attempt fails with UNIQUE constraint violation
            const uniqueError: any = new Error('duplicate key value violates unique constraint')
            uniqueError.code = '23505'
            uniqueError.constraint = 'telegram_user_mapping_username_key'
            mockQuery.mockRejectedValueOnce(uniqueError)

            // Mock: findNextAvailableUsername query (josiane exists)
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane' }],
            })

            // Mock: Second user doesn't exist by telegram_id (retry check)
            mockQuery.mockResolvedValueOnce({ rows: [] })

            // Mock: Second insert attempt succeeds with josiane2
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        id: '2',
                        username: 'josiane2',
                        telegram_id: '222222222',
                        telegram_username: '@josiane2',
                        first_name: 'Josiane',
                        last_name: 'Second',
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            })

            const result = await repository.upsertUser(secondUser)

            expect(result.username).toBe('josiane2')
            expect(result.telegram_id).toBe('222222222')
        })

        it('should handle multiple conflicts and keep retrying', async () => {
            const thirdUser: CreateTelegramUserMapping = {
                username: 'josiane',
                telegram_id: '333333333',
                first_name: 'Josiane',
            }

            // Mock: User doesn't exist
            mockQuery.mockResolvedValueOnce({ rows: [] })

            // Mock: First attempt fails (josiane taken)
            const error1: any = new Error('duplicate key')
            error1.code = '23505'
            error1.constraint = 'telegram_user_mapping_username_key'
            mockQuery.mockRejectedValueOnce(error1)

            // Mock: findNextAvailableUsername returns josiane2
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane' }],
            })

            // Mock: Second attempt fails (josiane2 also taken)
            mockQuery.mockResolvedValueOnce({ rows: [] })
            const error2: any = new Error('duplicate key')
            error2.code = '23505'
            error2.constraint = 'telegram_user_mapping_username_key'
            mockQuery.mockRejectedValueOnce(error2)

            // Mock: findNextAvailableUsername returns josiane3
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane2' }, { username: 'josiane' }],
            })

            // Mock: Third attempt succeeds
            mockQuery.mockResolvedValueOnce({ rows: [] })
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        id: '3',
                        username: 'josiane3',
                        telegram_id: '333333333',
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            })

            const result = await repository.upsertUser(thirdUser)

            expect(result.username).toBe('josiane3')
        })

        it('should throw error after max retries exceeded', async () => {
            const userData: CreateTelegramUserMapping = {
                username: 'josiane',
                telegram_id: '444444444',
            }

            // Mock: User doesn't exist (each retry)
            mockQuery.mockResolvedValue({ rows: [] })

            // Mock: All 5 insert attempts fail
            const uniqueError: any = new Error('duplicate key')
            uniqueError.code = '23505'
            uniqueError.constraint = 'telegram_user_mapping_username_key'

            for (let i = 0; i < 5; i++) {
                mockQuery.mockRejectedValueOnce(uniqueError)
                mockQuery.mockResolvedValueOnce({ rows: [{ username: 'josiane' }] })
            }

            await expect(repository.upsertUser(userData)).rejects.toThrow(
                'Failed to upsert user after 5 attempts'
            )
        })

        it('should rethrow non-UNIQUE errors immediately', async () => {
            const userData: CreateTelegramUserMapping = {
                username: 'josiane',
                telegram_id: '555555555',
            }

            // Mock: User doesn't exist
            mockQuery.mockResolvedValueOnce({ rows: [] })

            // Mock: Insert fails with different error (e.g., connection error)
            const connectionError = new Error('Connection lost')
            mockQuery.mockRejectedValueOnce(connectionError)

            await expect(repository.upsertUser(userData)).rejects.toThrow('Connection lost')
        })
    })

    describe('Edge Cases', () => {
        it('should handle username with numbers already present', async () => {
            // User with name "Josiane2" (their actual name, not a conflict resolution)
            const userData: CreateTelegramUserMapping = {
                username: 'josiane2',
                telegram_id: '666666666',
            }

            // Mock: User doesn't exist
            mockQuery.mockResolvedValueOnce({ rows: [] })

            // Mock: josiane2 username is taken, need to find next
            const error: any = new Error('duplicate key')
            error.code = '23505'
            error.constraint = 'telegram_user_mapping_username_key'
            mockQuery.mockRejectedValueOnce(error)

            // Mock: findNextAvailableUsername (base: josiane)
            mockQuery.mockResolvedValueOnce({
                rows: [{ username: 'josiane2' }, { username: 'josiane' }],
            })

            // Mock: Retry succeeds with josiane3
            mockQuery.mockResolvedValueOnce({ rows: [] })
            mockQuery.mockResolvedValueOnce({
                rows: [
                    {
                        id: '6',
                        username: 'josiane3',
                        telegram_id: '666666666',
                        created_at: new Date(),
                        updated_at: new Date(),
                    },
                ],
            })

            const result = await repository.upsertUser(userData)

            // Should strip number and find next available
            expect(result.username).toBe('josiane3')
        })

        it('should handle empty results from regex query', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] })

            const result = await repository.findNextAvailableUsername('newuser')

            expect(result).toBe('newuser')
        })
    })
})
