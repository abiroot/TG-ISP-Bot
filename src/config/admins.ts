/**
 * Admin Telegram user IDs configuration
 *
 * IMPORTANT: This supports two modes:
 *
 * 1. **NUMERIC IDS** (RECOMMENDED for security):
 *    - Use actual Telegram numeric IDs: '123456789', '987654321'
 *    - These IDs never change and cannot be hijacked
 *    - To get numeric IDs: Check database table 'user_identifiers' or bot logs
 *
 * 2. **USERNAMES** (Convenience, less secure):
 *    - Use Telegram usernames: 'username' or '@username'
 *    - Mapped to numeric IDs via user_identifiers table
 *    - WARNING: Users can change their username, requiring database update
 *
 * Current Implementation:
 * - adminCheck middleware first tries direct ID match
 * - If not matched, looks up username in user_identifiers table
 * - Returns the mapped Telegram ID for comparison
 *
 * Best Practice: Use numeric IDs for production systems
 *
 * Admins have special permissions to:
 * - Whitelist/remove groups and users
 * - View whitelist status
 * - Toggle maintenance mode and bot features
 * - Execute admin commands
 *
 * @example
 * // Recommended (numeric IDs):
 * export const ADMIN_IDS = ['123456789', '987654321']
 *
 * // Alternative (usernames - requires database mapping):
 * export const ADMIN_IDS = ['SOLamyy', 'lambasoft']
 */
export const ADMIN_IDS: string[] = [
    'SOLamyy', // @SOLamyy - Mapped via user_identifiers table
    'lambasoft', // @lambasoft - Mapped via user_identifiers table
    '5795384135' // Jhonny Hachem - Numeric Telegram ID
    // TODO: Replace with numeric Telegram IDs for production security
    // Example: '123456789', '987654321'
]

// Backward compatibility export (for v2 services)
export const admins = ADMIN_IDS

/**
 * Check if a Telegram user ID is an admin
 */
export function isAdmin(userId: string): boolean {
    return ADMIN_IDS.includes(userId)
}
