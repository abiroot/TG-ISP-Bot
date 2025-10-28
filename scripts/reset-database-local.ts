#!/usr/bin/env tsx
/**
 * Local Database Reset Script
 *
 * WARNING: This script will DELETE ALL DATA in your local database!
 *
 * What it does:
 * 1. Truncates all tables (preserves structure)
 * 2. Resets sequences
 * 3. Seeds default whitelist numbers
 *
 * Usage:
 *   npm run tsx scripts/reset-database-local.ts
 *   OR
 *   tsx scripts/reset-database-local.ts
 */

import 'dotenv/config'
import { createInterface } from 'readline'
import { pool, closeConnection } from '../src/config/database.js'

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

async function resetDatabase() {
    console.log('\n🚨 ========================================')
    console.log('   LOCAL DATABASE RESET')
    console.log('   ========================================\n')

    console.log('⚠️  WARNING: This will DELETE ALL DATA in your local database!\n')
    console.log('Tables affected:')
    console.log('  • messages')
    console.log('  • conversation_embeddings')
    console.log('  • personalities')
    console.log('  • isp_queries')
    console.log('  • whitelisted_groups')
    console.log('  • whitelisted_numbers')
    console.log('  • bot_state\n')

    const confirmation = await ask('Type "DELETE LOCAL DATABASE" to confirm: ')

    if (confirmation.trim() !== 'DELETE LOCAL DATABASE') {
        console.log('\n❌ Confirmation failed. Database reset cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Starting database reset...\n')

    try {
        // Truncate all tables
        console.log('1️⃣  Truncating messages table...')
        await pool.query('TRUNCATE TABLE messages RESTART IDENTITY CASCADE')

        console.log('2️⃣  Truncating conversation_embeddings table...')
        await pool.query('TRUNCATE TABLE conversation_embeddings RESTART IDENTITY CASCADE')

        console.log('3️⃣  Truncating personalities table...')
        await pool.query('TRUNCATE TABLE personalities RESTART IDENTITY CASCADE')

        console.log('4️⃣  Truncating isp_queries table...')
        await pool.query('TRUNCATE TABLE isp_queries RESTART IDENTITY CASCADE')

        console.log('5️⃣  Truncating conversation_embeddings table...')
        await pool.query('TRUNCATE TABLE conversation_embeddings RESTART IDENTITY CASCADE')

        console.log('6️⃣  Truncating whitelisted_groups table...')
        await pool.query('TRUNCATE TABLE whitelisted_groups RESTART IDENTITY CASCADE')

        console.log('7️⃣  Truncating whitelisted_numbers table...')
        await pool.query('TRUNCATE TABLE whitelisted_numbers RESTART IDENTITY CASCADE')

        console.log('8️⃣  Truncating bot_state table...')
        await pool.query('TRUNCATE TABLE bot_state RESTART IDENTITY CASCADE')

        // Seed default whitelist numbers
        console.log('\n9️⃣  Seeding default whitelist numbers...')

        const defaultNumbers = [
            '+96170454176',
            '+96170201076',
            '+96170118353',
            '+96170442737', // Admin number
        ]

        for (const userIdentifier of defaultNumbers) {
            await pool.query(
                `INSERT INTO whitelisted_numbers (user_identifier, whitelisted_by, notes)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_identifier) DO NOTHING`,
                [userIdentifier, 'system', 'Default whitelist - seeded by reset script']
            )
            console.log(`   ✓ Added ${userIdentifier}`)
        }

        console.log('\n✅ ========================================')
        console.log('   DATABASE RESET COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log('  ✓ All tables truncated')
        console.log(`  ✓ ${defaultNumbers.length} default numbers whitelisted`)
        console.log('  ✓ Database is clean and ready\n')
    } catch (error) {
        console.error('\n❌ Error during database reset:', error)
        process.exit(1)
    } finally {
        rl.close()
        await closeConnection()
    }
}

// Run the script
resetDatabase()
