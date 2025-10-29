import { whitelistRepository } from '~/database/repositories/whitelistRepository'

export class WhitelistService {
    /**
     * Check if a context (group or number) is whitelisted
     */
    async isWhitelisted(contextId: string, isGroup: boolean): Promise<boolean> {
        if (isGroup) {
            return await whitelistRepository.isGroupWhitelisted(contextId)
        } else {
            return await whitelistRepository.isUserWhitelisted(contextId)
        }
    }

    /**
     * Add a group to whitelist
     */
    async whitelistGroup(groupId: string, whitelistedBy: string, notes?: string) {
        return await whitelistRepository.addGroup({
            group_id: groupId,
            whitelisted_by: whitelistedBy,
            notes,
        })
    }

    /**
     * Add a user to whitelist (supports Telegram usernames and user IDs)
     */
    async whitelistUser(userIdentifier: string, whitelistedBy: string, notes?: string) {
        return await whitelistRepository.addUser({
            user_identifier: userIdentifier,
            whitelisted_by: whitelistedBy,
            notes,
        })
    }

    /**
     * Remove a group from whitelist
     */
    async removeGroup(groupId: string): Promise<boolean> {
        return await whitelistRepository.removeGroup(groupId)
    }

    /**
     * Remove a user from whitelist
     */
    async removeUser(userIdentifier: string): Promise<boolean> {
        return await whitelistRepository.removeUser(userIdentifier)
    }

    /**
     * Get all whitelisted groups
     */
    async getAllGroups() {
        return await whitelistRepository.getAllGroups()
    }

    /**
     * Get all whitelisted users
     */
    async getAllUsers() {
        return await whitelistRepository.getAllUsers()
    }
}

// Export singleton instance
export const whitelistService = new WhitelistService()
