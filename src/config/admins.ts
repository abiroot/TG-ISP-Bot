/**
 * Admin Telegram user IDs configuration
 *
 * Add admin Telegram user IDs here (numeric IDs or usernames)
 * Examples: '123456789' (numeric ID), '@username' (with @)
 *
 * To get user IDs:
 * 1. Send a message to your bot
 * 2. Check the logs or database for the 'from' field
 *
 * Admins have special permissions to:
 * - Whitelist/remove groups
 * - Whitelist/remove users
 * - View whitelist status
 * - Toggle maintenance mode
 * - Manage bot features
 */
export const ADMIN_IDS: string[] = [
    'SOLamyy', // SOLamyy - store username without @ prefix for consistency
    // Add more admin IDs as needed
]

/**
 * Check if a Telegram user ID is an admin
 */
export function isAdmin(userId: string): boolean {
    return ADMIN_IDS.includes(userId)
}
