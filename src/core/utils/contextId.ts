/**
 * Context ID Manager
 *
 * Centralized utility for handling context IDs consistently across the application.
 * Context IDs are used to identify conversation contexts (users or groups).
 *
 * Format:
 * - Private chats: User phone/ID as-is (e.g., "1234567890")
 * - Group chats: Group ID as-is (e.g., "-1001234567890")
 *
 * NOTE: Old pattern used prefixes like "group_" and "user_" but this is unnecessary
 * since group IDs always start with "-" and user IDs never do.
 */

/**
 * Context type (derived from ID)
 */
export type ContextType = 'group' | 'private'

/**
 * Get context ID from user/group identifier
 *
 * @param from - User phone/ID or group ID
 * @returns Context ID (same as input, normalized to string)
 */
export function getContextId(from: string | number): string {
    return String(from)
}

/**
 * Get context type from identifier
 *
 * @param from - User phone/ID or group ID
 * @returns 'group' if ID starts with '-', otherwise 'private'
 */
export function getContextType(from: string | number): ContextType {
    const fromStr = String(from)
    return fromStr.startsWith('-') ? 'group' : 'private'
}

/**
 * Check if context is a group
 *
 * @param contextId - Context ID
 * @returns true if group, false if private
 */
export function isGroupContext(contextId: string): boolean {
    return contextId.startsWith('-')
}

/**
 * Check if context is a private chat
 *
 * @param contextId - Context ID
 * @returns true if private, false if group
 */
export function isPrivateContext(contextId: string): boolean {
    return !contextId.startsWith('-')
}

/**
 * Normalize group ID (ensure it starts with -)
 *
 * @param groupId - Group ID
 * @returns Normalized group ID with leading '-'
 */
export function normalizeGroupId(groupId: string | number): string {
    const id = String(groupId)
    return id.startsWith('-') ? id : `-${id}`
}

/**
 * Extract numeric ID from context ID
 *
 * @param contextId - Context ID
 * @returns Numeric ID (without '-' for groups)
 */
export function extractNumericId(contextId: string): string {
    return contextId.replace(/^-/, '')
}
