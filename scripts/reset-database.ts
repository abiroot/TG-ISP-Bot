/**
 * Database Reset Script
 *
 * Drops all tables and re-runs migrations from scratch.
 * WARNING: This will delete ALL data!
 *
 * Usage: npx tsx scripts/reset-database.ts
 */

import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({
    host: process.env.POSTGRES_DB_HOST,
    user: process.env.POSTGRES_DB_USER,
    database: process.env.POSTGRES_DB_NAME,
    password: process.env.POSTGRES_DB_PASSWORD,
    port: parseInt(process.env.POSTGRES_DB_PORT || '5432'),
})

async function resetDatabase() {
    console.log('⚠️  WARNING: This will DELETE ALL DATA from the database!')
    console.log('   Database:', process.env.POSTGRES_DB_NAME)
    console.log('   Host:', process.env.POSTGRES_DB_HOST)
    console.log('')

    try {
        console.log('🗑️  Dropping all tables...')

        // Drop all tables in order (respecting dependencies)
        const dropTables = `
            DROP TABLE IF EXISTS customer_search_activity CASCADE;
            DROP TABLE IF EXISTS tool_execution_audit CASCADE;
            DROP TABLE IF EXISTS conversation_embeddings CASCADE;
            DROP TABLE IF EXISTS messages CASCADE;
            DROP TABLE IF EXISTS setup_state_temp CASCADE;
            DROP TABLE IF EXISTS bot_state CASCADE;
            DROP TABLE IF EXISTS personalities CASCADE;
            DROP TABLE IF EXISTS user_roles CASCADE;
            DROP TABLE IF EXISTS whitelisted_users CASCADE;
            DROP TABLE IF EXISTS whitelisted_groups CASCADE;
            DROP TABLE IF EXISTS telegram_user_mapping CASCADE;
            DROP TABLE IF EXISTS customer_locations CASCADE;
            DROP TABLE IF EXISTS migrations CASCADE;
        `

        await pool.query(dropTables)
        console.log('✅ All tables dropped successfully')

        // Drop the update_updated_at_column function
        console.log('🗑️  Dropping functions...')
        await pool.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE')
        await pool.query('DROP FUNCTION IF EXISTS update_conversation_embeddings_updated_at() CASCADE')
        console.log('✅ Functions dropped successfully')

        console.log('')
        console.log('✅ Database reset complete!')
        console.log('   Run "npm run dev" to re-create tables via migrations')
    } catch (error) {
        console.error('❌ Failed to reset database:', error)
        throw error
    } finally {
        await pool.end()
    }
}

resetDatabase().catch(() => process.exit(1))
