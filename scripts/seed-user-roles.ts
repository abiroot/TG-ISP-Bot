#!/usr/bin/env tsx
/**
 * User Roles Seeder Script
 *
 * Seeds the user_roles table with predefined role assignments.
 * Useful for development/testing environments.
 *
 * Usage:
 *   npm run seed:roles           # Seed local database
 *   npm run seed:roles:prod      # Seed production database
 *
 * OR directly:
 *   tsx scripts/seed-user-roles.ts --local
 *   tsx scripts/seed-user-roles.ts --production
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

// Role assignment seed data
const ROLE_ASSIGNMENTS = [
    {
        telegram_id: '1473818060',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - its (@rbob98) - Collector',
        display: 'its (@rbob98) - collector',
    },
    {
        telegram_id: '1473818060',
        role: 'worker',
        assigned_by: 'system',
        notes: 'Seeded role - its (@rbob98) - Worker',
        display: 'its (@rbob98) - worker',
    },
    {
        telegram_id: '8177411078',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - ibrahim (@ibrahimtaktak) - Collector',
        display: 'ibrahim (@ibrahimtaktak) - collector',
    },
    {
        telegram_id: '8177411078',
        role: 'worker',
        assigned_by: 'system',
        notes: 'Seeded role - ibrahim (@ibrahimtaktak) - Worker',
        display: 'ibrahim (@ibrahimtaktak) - worker',
    },
    {
        telegram_id: '8480834371',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - marwan (no handle) - Collector',
        display: 'marwan (no handle) - collector',
    },
    {
        telegram_id: '8480834371',
        role: 'worker',
        assigned_by: 'system',
        notes: 'Seeded role - marwan (no handle) - Worker',
        display: 'marwan (no handle) - worker',
    },
    {
        telegram_id: '5299501436',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - mohamad (@mohamadomar12) - Collector',
        display: 'mohamad (@mohamadomar12) - collector',
    },
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
 * Seed local database
 */
async function seedLocalDatabase() {
    console.log('\n📋 ========================================')
    console.log('   USER ROLES SEEDER')
    console.log('   ========================================\n')

    console.log(`ℹ️  This will insert ${ROLE_ASSIGNMENTS.length} role assignments into user_roles table.\n`)

    console.log('Role assignments to be seeded:')
    ROLE_ASSIGNMENTS.forEach((assignment) => {
        console.log(`  • ${assignment.display}`)
    })
    console.log()

    const confirmation = await ask('Type "YES" to proceed: ')

    if (confirmation.trim().toUpperCase() !== 'YES') {
        console.log('\n❌ Seeding cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Starting seeding process...\n')

    try {
        let successCount = 0
        let skipCount = 0
        let errorCount = 0

        for (const assignment of ROLE_ASSIGNMENTS) {
            try {
                // Check if role assignment already exists
                const existingRole = await pool.query(
                    'SELECT id FROM user_roles WHERE user_telegram_id = $1 AND role = $2',
                    [assignment.telegram_id, assignment.role]
                )

                if (existingRole.rows.length > 0) {
                    console.log(`  ⊘ Skipped ${assignment.display} (already exists)`)
                    skipCount++
                    continue
                }

                // Insert role assignment
                await pool.query(
                    `INSERT INTO user_roles (user_telegram_id, role, assigned_by, notes)
                     VALUES ($1, $2, $3, $4)`,
                    [assignment.telegram_id, assignment.role, assignment.assigned_by, assignment.notes]
                )

                console.log(`  ✓ Assigned ${assignment.display}`)
                successCount++
            } catch (error) {
                console.error(`  ✗ Error assigning ${assignment.display}:`, error)
                errorCount++
            }
        }

        console.log('\n✅ ========================================')
        console.log('   SEEDING COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log(`  ✓ ${successCount} role assignments created`)
        console.log(`  ⊘ ${skipCount} role assignments skipped (already exist)`)
        if (errorCount > 0) {
            console.log(`  ✗ ${errorCount} errors occurred`)
        }
        console.log()
    } catch (error) {
        console.error('\n❌ Error during seeding:', error)
        process.exit(1)
    } finally {
        rl.close()
        await closeConnection()
    }
}

/**
 * Seed production database via SSH
 */
async function seedProductionDatabase() {
    console.log('\n📋 ========================================')
    console.log('   PRODUCTION USER ROLES SEEDING')
    console.log('   ========================================\n')

    console.log(`⚠️  This will seed role assignments on production server!`)
    console.log(`Server: ${PROD_SERVER}`)
    console.log(`Database: ${PROD_DB_NAME}\n`)

    console.log(`ℹ️  ${ROLE_ASSIGNMENTS.length} role assignments will be inserted.\n`)

    const confirmation = await ask('Type "YES SEED PRODUCTION" to confirm: ')

    if (confirmation.trim() !== 'YES SEED PRODUCTION') {
        console.log('\n❌ Confirmation failed. Seeding cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Connecting to production server...\n')

    try {
        // Build SQL commands
        const insertCommands = ROLE_ASSIGNMENTS.map((assignment) => {
            return (
                `INSERT INTO user_roles (user_telegram_id, role, assigned_by, notes) ` +
                `VALUES ('${assignment.telegram_id}', '${assignment.role}', '${assignment.assigned_by}', '${assignment.notes.replace(/'/g, "''")}') ` +
                `ON CONFLICT (user_telegram_id, role) DO NOTHING;`
            )
        }).join(' ')

        console.log('1️⃣  Executing seeding on server...')

        // Execute SQL via SSH
        const command = `ssh ${PROD_SERVER} "cd ${PROD_PROJECT_PATH} && PGPASSWORD='${PROD_DB_PASSWORD}' psql -h localhost -U ${PROD_DB_USER} -d ${PROD_DB_NAME} -c \\"${insertCommands.replace(/"/g, '\\"')}\\"`

        execSync(command, {
            stdio: 'inherit',
        })

        console.log('\n✅ ========================================')
        console.log('   PRODUCTION SEEDING COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log(`  ✓ ${ROLE_ASSIGNMENTS.length} role assignments seeded`)
        console.log('  ℹ️  Existing role assignments were skipped (ON CONFLICT DO NOTHING)\n')
    } catch (error) {
        console.error('\n❌ Error during production seeding:', error)
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
        console.log('  npm run seed:roles           # Seed local database')
        console.log('  npm run seed:roles:prod      # Seed production database')
        console.log('\nOR:')
        console.log('  tsx scripts/seed-user-roles.ts --local')
        console.log('  tsx scripts/seed-user-roles.ts --production')
        console.log()
        process.exit(0)
    }

    try {
        if (isProduction) {
            await seedProductionDatabase()
        } else {
            await seedLocalDatabase()
        }
    } catch (error) {
        console.error('Fatal error:', error)
        process.exit(1)
    }
}

// Run the script
main()
