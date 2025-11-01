#!/usr/bin/env tsx
/**
 * Unified Database Reset Script
 *
 * Supports both local and production database resets with safety checks.
 *
 * Usage:
 *   npm run db:reset           # Reset local database
 *   npm run db:reset:prod      # Reset production database
 *
 * OR directly:
 *   tsx scripts/db-reset.ts --local
 *   tsx scripts/db-reset.ts --production
 */

import 'dotenv/config'
import { createInterface } from 'readline'
import { pool, closeConnection } from '../src/config/database.js'
import { execSync } from 'child_process'

// Configuration
const PROD_SERVER = 'root@159.223.220.101'
const PROD_DB_NAME = 'tg_isp'
const PROD_DB_USER = 'tg_isp'
const PROD_DB_PASSWORD = '@BI_root_123'
const PROD_PROJECT_PATH = '/home/vito/tg-isp.abiroot.dev'

// Default whitelist users
const DEFAULT_WHITELIST_USERS = [
    { identifier: '5795384135', note: 'Jhonny Hachem' },
]

// Parse command line arguments
const args = process.argv.slice(2)
const isProduction = args.includes('--production') || args.includes('--prod') || args.includes('-p')
const isLocal = args.includes('--local') || args.includes('-l') || !isProduction

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
})

function ask(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer)
        })
    })
}

/**
 * Get list of all tables to truncate
 */
function getTableList(): string[] {
    return [
        'messages',
        'conversation_embeddings',
        'personalities',
        'whitelisted_groups',
        'whitelisted_users',
        'telegram_user_mapping',
        'onboarding_state',
        'bot_state',
        'tool_execution_audit',
    ]
}

/**
 * Reset local database
 */
async function resetLocalDatabase() {
    console.log('\n🚨 ========================================')
    console.log('   LOCAL DATABASE RESET')
    console.log('   ========================================\n')

    console.log('⚠️  WARNING: This will DELETE ALL DATA in your local database!\n')

    const tables = getTableList()
    console.log('Tables to be cleared:')
    tables.forEach((table) => console.log(`  • ${table}`))
    console.log()

    const confirmation = await ask('Type "DELETE LOCAL DATABASE" to confirm: ')

    if (confirmation.trim() !== 'DELETE LOCAL DATABASE') {
        console.log('\n❌ Confirmation failed. Database reset cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Starting database reset...\n')

    try {
        let count = 1

        // Truncate all tables
        for (const table of tables) {
            console.log(`${count}️⃣  Truncating ${table} table...`)
            await pool.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`)
            count++
        }

        // Seed default whitelist users
        console.log(`\n${count}️⃣  Seeding default whitelist users...`)

        for (const user of DEFAULT_WHITELIST_USERS) {
            await pool.query(
                `INSERT INTO whitelisted_users (user_identifier, whitelisted_by, notes)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_identifier) DO NOTHING`,
                [user.identifier, 'system', `Default whitelist - ${user.note}`]
            )
            console.log(`   ✓ Added ${user.identifier} (${user.note})`)
        }

        console.log('\n✅ ========================================')
        console.log('   DATABASE RESET COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log(`  ✓ ${tables.length} tables truncated`)
        console.log(`  ✓ ${DEFAULT_WHITELIST_USERS.length} default users whitelisted`)
        console.log('  ✓ Database is clean and ready\n')
    } catch (error) {
        console.error('\n❌ Error during database reset:', error)
        process.exit(1)
    } finally {
        rl.close()
        await closeConnection()
    }
}

/**
 * Reset production database via SSH
 */
async function resetProductionDatabase() {
    console.log('\n🚨 ========================================')
    console.log('   PRODUCTION DATABASE RESET')
    console.log('   ========================================\n')

    console.log(`⚠️  WARNING: This will DELETE ALL DATA on production server!`)
    console.log(`Server: ${PROD_SERVER}`)
    console.log(`Database: ${PROD_DB_NAME}\n`)

    const tables = getTableList()
    console.log('Tables to be cleared:')
    tables.forEach((table) => console.log(`  • ${table}`))
    console.log()

    // First confirmation
    const confirmation1 = await ask('Type "DELETE PRODUCTION DATABASE" to confirm: ')

    if (confirmation1.trim() !== 'DELETE PRODUCTION DATABASE') {
        console.log('\n❌ Confirmation failed. Database reset cancelled.')
        rl.close()
        process.exit(0)
    }

    // Second confirmation
    const confirmation2 = await ask('\n⚠️  Are you ABSOLUTELY sure? Type "YES DELETE EVERYTHING": ')

    if (confirmation2.trim() !== 'YES DELETE EVERYTHING') {
        console.log('\n❌ Second confirmation failed. Database reset cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Connecting to production server...\n')

    try {
        // Build SQL commands
        const truncateCommands = tables.map((table) => `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`).join(' ')

        const seedCommands = DEFAULT_WHITELIST_USERS.map(
            (user) =>
                `INSERT INTO whitelisted_users (user_identifier, whitelisted_by, notes) ` +
                `VALUES ('${user.identifier}', 'system', 'Default whitelist - ${user.note}') ` +
                `ON CONFLICT (user_identifier) DO NOTHING;`
        ).join(' ')

        const sqlCommands = truncateCommands + ' ' + seedCommands

        console.log('1️⃣  Executing database reset on server...')

        // Execute SQL via SSH
        const command = `ssh ${PROD_SERVER} "cd ${PROD_PROJECT_PATH} && PGPASSWORD='${PROD_DB_PASSWORD}' psql -h localhost -U ${PROD_DB_USER} -d ${PROD_DB_NAME} -c \\"${sqlCommands.replace(/"/g, '\\"')}\\"`

        execSync(command, {
            stdio: 'inherit',
        })

        console.log('\n✅ ========================================')
        console.log('   PRODUCTION DATABASE RESET COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log(`  ✓ ${tables.length} tables truncated`)
        console.log(`  ✓ ${DEFAULT_WHITELIST_USERS.length} default users whitelisted`)
        console.log('  ✓ Production database is clean and ready')
        console.log('\n⏳ Remember: VitoDeploy will auto-deploy when you push to main')
        console.log('   Deployment takes ~2 minutes\n')
    } catch (error) {
        console.error('\n❌ Error during production database reset:', error)
        console.log('\nTroubleshooting:')
        console.log(`  1. Check SSH access: ssh ${PROD_SERVER}`)
        console.log('  2. Check database credentials in server .env')
        console.log('  3. Check PostgreSQL is running: sudo systemctl status postgresql')
        process.exit(1)
    } finally {
        rl.close()
    }
}

/**
 * Main entry point
 */
async function main() {
    // Show usage if no valid arguments
    if (!isLocal && !isProduction) {
        console.log('\n📋 Usage:')
        console.log('  npm run db:reset           # Reset local database')
        console.log('  npm run db:reset:prod      # Reset production database')
        console.log('\nOR:')
        console.log('  tsx scripts/db-reset.ts --local')
        console.log('  tsx scripts/db-reset.ts --production')
        console.log()
        process.exit(0)
    }

    try {
        if (isProduction) {
            await resetProductionDatabase()
        } else {
            await resetLocalDatabase()
        }
    } catch (error) {
        console.error('Fatal error:', error)
        process.exit(1)
    }
}

// Run the script
main()
