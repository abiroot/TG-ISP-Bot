import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from '~/config/database'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Check if migration has already been applied
 */
async function isMigrationApplied(migrationName: string): Promise<boolean> {
    try {
        const result = await pool.query('SELECT 1 FROM migrations WHERE name = $1', [migrationName])
        return result.rows.length > 0
    } catch (error) {
        // migrations table doesn't exist yet (first run)
        return false
    }
}

/**
 * Mark migration as applied
 */
async function recordMigration(migrationName: string): Promise<void> {
    await pool.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [
        migrationName,
    ])
}

/**
 * Run all database migrations
 */
export async function runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...')

    const migrations = [
        '001_init.sql',
        '002_cleanup_function.sql',
        '003_customer_locations.sql',
        '004_user_roles.sql',
        '005_rename_user_mapping_columns.sql',
    ]

    try {
        for (const migration of migrations) {
            // Check if migration already applied
            const alreadyApplied = await isMigrationApplied(migration)
            if (alreadyApplied) {
                console.log(`  ⏭  Skipping migration (already applied): ${migration}`)
                continue
            }

            console.log(`  → Running migration: ${migration}`)
            const migrationPath = join(__dirname, migration)
            const migrationSQL = readFileSync(migrationPath, 'utf-8')
            await pool.query(migrationSQL)

            // Record migration as applied
            await recordMigration(migration)
            console.log(`  ✓ Migration completed: ${migration}`)
        }

        console.log('✅ All migrations completed successfully')
    } catch (error) {
        console.error('❌ Migration failed:', error)
        throw error
    }
}
