/**
 * Utility script to retrieve numeric Telegram IDs for admin users
 * Run with: npx tsx scripts/getAdminIds.ts
 *
 * This helps convert username-based admin config to numeric IDs for better security
 */

import { pool } from '~/config/database'
import { ADMIN_IDS } from '~/config/admins'

async function getAdminTelegramIds() {
    console.log('🔍 Looking up Telegram IDs for configured admins...\n')

    try {
        for (const identifier of ADMIN_IDS) {
            // Clean username (remove @ if present)
            const cleanIdentifier = identifier.startsWith('@') ? identifier.substring(1) : identifier

            // Check if it's already a numeric ID
            if (/^\d+$/.test(cleanIdentifier)) {
                console.log(`✅ "${identifier}" - Already a numeric ID`)
                continue
            }

            // Query database for username mapping
            const result = await pool.query(
                `SELECT telegram_id, username, first_name, last_name, last_seen
                 FROM user_identifiers
                 WHERE username = $1
                 ORDER BY last_seen DESC
                 LIMIT 1`,
                [cleanIdentifier]
            )

            if (result.rows.length > 0) {
                const user = result.rows[0]
                console.log(`✅ "${identifier}" → Telegram ID: ${user.telegram_id}`)
                console.log(`   Name: ${user.first_name || ''} ${user.last_name || ''}`.trim())
                console.log(`   Last seen: ${user.last_seen}`)
            } else {
                console.log(`⚠️  "${identifier}" - NOT FOUND in database`)
                console.log(`   Make sure this user has sent at least one message to the bot`)
            }
            console.log('') // Empty line for readability
        }

        console.log('\n📝 Suggested config/admins.ts update:')
        console.log('export const ADMIN_IDS: string[] = [')

        for (const identifier of ADMIN_IDS) {
            const cleanIdentifier = identifier.startsWith('@') ? identifier.substring(1) : identifier

            if (/^\d+$/.test(cleanIdentifier)) {
                console.log(`    '${cleanIdentifier}', // Already numeric ID`)
                continue
            }

            const result = await pool.query(
                `SELECT telegram_id FROM user_identifiers WHERE username = $1 LIMIT 1`,
                [cleanIdentifier]
            )

            if (result.rows.length > 0) {
                console.log(`    '${result.rows[0].telegram_id}', // @${cleanIdentifier}`)
            } else {
                console.log(`    // '${identifier}', // NOT FOUND - keep as username or remove`)
            }
        }

        console.log(']\n')

    } catch (error) {
        console.error('❌ Error:', error)
    } finally {
        await pool.end()
    }
}

getAdminTelegramIds()
