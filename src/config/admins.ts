/**
 * Admin Telegram user IDs configuration
 *
 * SECURITY BEST PRACTICE: Use numeric Telegram IDs for production
 *
 * Numeric IDs are:
 * - Permanent and never change
 * - Cannot be hijacked by username changes
 * - More secure for production systems
 *
 * How to get numeric Telegram IDs:
 * 1. EASIEST: Send `/getmyid` command to the bot
 * 2. Alternative: Send `/users` as admin to see all telegram_user_mapping entries
 * 3. Database query: SELECT telegram_id, worker_username FROM telegram_user_mapping;
 * 4. Use the numeric ID (e.g., '123456789') in this array
 *
 * Admins have special permissions to:
 * - Whitelist/remove groups and users
 * - View whitelist status
 * - Toggle maintenance mode and bot features
 * - Execute admin commands
 *
 * @example
 * export const ADMIN_IDS = ['123456789', '987654321', '5795384135']
 */
export const ADMIN_IDS: string[] = [
    '5795384135', // Jhonny Hachem - Numeric Telegram ID (secure)
    '341628148', // Lamba - Dev/Testing account
    // Add more numeric Telegram IDs here:
    // '123456789', // Admin Name
    // '987654321', // Another Admin
]

// Backward compatibility export (for v2 services)
export const admins = ADMIN_IDS

/**
 * Check if a Telegram user ID is an admin
 */
export function isAdmin(userId: string): boolean {
    return ADMIN_IDS.includes(userId)
}
