#!/usr/bin/env tsx
/**
 * Server Database Reset Script
 *
 * WARNING: This script will DELETE ALL DATA in the PRODUCTION database!
 *
 * What it does:
 * 1. Connects to production server via SSH
 * 2. Truncates all tables (preserves structure)
 * 3. Resets sequences
 * 4. Seeds default whitelist numbers
 *
 * Usage:
 *   npm run tsx scripts/reset-database-server.ts
 *   OR
 *   tsx scripts/reset-database-server.ts
 */

import { execSync } from 'child_process'
import { createInterface } from 'readline'

const SERVER_HOST = 'root@159.223.220.101'
const DB_NAME = 'tg_isp'
const DB_USER = 'tg_isp'

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

async function resetServerDatabase() {
    console.log('\n🚨 ========================================')
    console.log('   PRODUCTION DATABASE RESET')
    console.log('   ========================================\n')

    console.log(`⚠️  WARNING: This will DELETE ALL DATA on production server!`)
    console.log(`Server: ${SERVER_HOST}`)
    console.log(`Database: ${DB_NAME}\n`)

    console.log('Tables affected:')
    console.log('  • messages')
    console.log('  • conversation_embeddings')
    console.log('  • personalities')
    console.log('  • isp_queries')
    console.log('  • whitelisted_groups')
    console.log('  • whitelisted_numbers')
    console.log('  • bot_state\n')

    const confirmation1 = await ask('Type "DELETE PRODUCTION DATABASE" to confirm: ')

    if (confirmation1.trim() !== 'DELETE PRODUCTION DATABASE') {
        console.log('\n❌ Confirmation failed. Database reset cancelled.')
        rl.close()
        process.exit(0)
    }

    const confirmation2 = await ask('\n⚠️  Are you ABSOLUTELY sure? Type "YES DELETE EVERYTHING": ')

    if (confirmation2.trim() !== 'YES DELETE EVERYTHING') {
        console.log('\n❌ Second confirmation failed. Database reset cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Connecting to production server...\n')

    try {
        // SQL commands to run on the server
        const sqlCommands = `
-- Truncate all tables
TRUNCATE TABLE messages RESTART IDENTITY CASCADE;
TRUNCATE TABLE conversation_embeddings RESTART IDENTITY CASCADE;
TRUNCATE TABLE personalities RESTART IDENTITY CASCADE;
TRUNCATE TABLE isp_queries RESTART IDENTITY CASCADE;
TRUNCATE TABLE whitelisted_groups RESTART IDENTITY CASCADE;
TRUNCATE TABLE whitelisted_numbers RESTART IDENTITY CASCADE;
TRUNCATE TABLE bot_state RESTART IDENTITY CASCADE;

-- Seed default whitelist users
INSERT INTO whitelisted_numbers (user_identifier, whitelisted_by, notes)
VALUES
    ('+96170454176', 'system', 'Default whitelist - seeded by reset script'),
    ('+96170201076', 'system', 'Default whitelist - seeded by reset script'),
    ('+96170118353', 'system', 'Default whitelist - seeded by reset script'),
    ('+96170442737', 'system', 'Default whitelist - admin number')
ON CONFLICT (user_identifier) DO NOTHING;
        `

        console.log('1️⃣  Executing database reset on server...')

        // Execute SQL via SSH
        const command = `ssh ${SERVER_HOST} "sudo -u postgres psql -d ${DB_NAME} -c \\"${sqlCommands.replace(/"/g, '\\"').replace(/\n/g, ' ')}\\"`

        execSync(command, {
            stdio: 'inherit',
        })

        console.log('\n✅ ========================================')
        console.log('   PRODUCTION DATABASE RESET COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log('  ✓ All tables truncated')
        console.log('  ✓ 4 default numbers whitelisted')
        console.log('  ✓ Production database is clean and ready')
        console.log('\n⏳ Remember: VitoDeploy will auto-deploy when you push to main')
        console.log('   Deployment takes ~2 minutes\n')
    } catch (error) {
        console.error('\n❌ Error during server database reset:', error)
        console.log('\nTroubleshooting:')
        console.log('  1. Check SSH access: ssh root@159.223.220.101')
        console.log('  2. Check database credentials in server .env')
        console.log('  3. Check PostgreSQL is running: sudo systemctl status postgresql')
        process.exit(1)
    } finally {
        rl.close()
    }
}

// Run the script
resetServerDatabase()
