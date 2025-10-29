import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '~/config/database'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Run all database migrations
 */
export async function runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...')

    const migrations = [
        '001_init.sql',
        '002_bot_state.sql',
        '008_add_pgvector_extension.sql',
        '010_seed_whitelist.sql',
        '011_add_user_identifiers.sql',
        '013_tool_execution_audit.sql',
    ]

    try {
        for (const migration of migrations) {
            console.log(`  → Running migration: ${migration}`)
            const migrationPath = join(__dirname, 'database', 'migrations', migration)
            const migrationSQL = readFileSync(migrationPath, 'utf-8')
            await pool.query(migrationSQL)
            console.log(`  ✓ Migration completed: ${migration}`)
        }

        console.log('✅ All migrations completed successfully')
    } catch (error) {
        console.error('❌ Migration failed:', error)
        throw error
    }
}
