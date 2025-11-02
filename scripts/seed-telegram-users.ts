#!/usr/bin/env tsx
/**
 * Telegram User Mapping Seeder Script
 *
 * Seeds the telegram_user_mapping table with predefined users.
 * Useful for development/testing environments.
 *
 * Usage:
 *   npm run seed:users           # Seed local database
 *   npm run seed:users:prod      # Seed production database
 *
 * OR directly:
 *   tsx scripts/seed-telegram-users.ts --local
 *   tsx scripts/seed-telegram-users.ts --production
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

// User seed data
const SEED_USERS = [
    {
        id: '9fc6c09c-919a-4bce-b26e-7b95361e956e',
        worker_username: 'lamba',
        telegram_id: '341628148',
        telegram_handle: 'lambasoft',
        first_name: 'Lamba',
        last_name: 'Aoun',
        created_at: '2025-11-01 19:21:03.174118+00',
        updated_at: '2025-11-01 20:43:34.981785+00',
    },
    {
        id: 'e9805425-c640-415a-a258-cbc4a7922318',
        worker_username: 'jhonny',
        telegram_id: '5795384135',
        telegram_handle: 'colljhonny',
        first_name: 'jhonny',
        last_name: 'hachem',
        created_at: '2025-11-01 19:32:56.277564+00',
        updated_at: '2025-11-02 09:40:57.72028+00',
    },
    {
        id: '2301194a-3130-493f-8dce-af1c2313e4e2',
        worker_username: 'weare',
        telegram_id: '1765031061',
        telegram_handle: 'lebanonymous313',
        first_name: 'We Are',
        last_name: 'Anonymous',
        created_at: '2025-11-01 20:15:26.047998+00',
        updated_at: '2025-11-01 20:15:43.207189+00',
    },
    {
        id: '33f7531c-56ce-490f-b3c4-648896053e7c',
        worker_username: 'its',
        telegram_id: '1473818060',
        telegram_handle: 'rbob98',
        first_name: 'its',
        last_name: 'bob98',
        created_at: '2025-11-01 20:20:58.144526+00',
        updated_at: '2025-11-01 20:25:46.062602+00',
    },
    {
        id: '84e89a75-c63f-4411-8c28-abfa27e7b9e5',
        worker_username: 'ibrahim',
        telegram_id: '8177411078',
        telegram_handle: 'ibrahimtaktak',
        first_name: 'Ibrahim',
        last_name: 'Taktak',
        created_at: '2025-11-01 20:29:29.276455+00',
        updated_at: '2025-11-01 20:34:10.52958+00',
    },
    {
        id: '7793e9d4-00d3-44f2-80d2-70e0a794a04d',
        worker_username: 'marwan',
        telegram_id: '8480834371',
        telegram_handle: null, // User without Telegram handle
        first_name: 'Marwan',
        last_name: 'Adnan',
        created_at: '2025-11-01 20:35:44.473497+00',
        updated_at: '2025-11-01 20:37:09.358377+00',
    },
    {
        id: '99a5d629-17d5-4daf-986c-8b323f42f256',
        worker_username: 'mohamad',
        telegram_id: '5299501436',
        telegram_handle: 'mohamadomar12',
        first_name: 'Mohamad',
        last_name: 'Omar',
        created_at: '2025-11-01 20:43:39.379212+00',
        updated_at: '2025-11-02 10:30:13.568327+00',
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
    console.log('   TELEGRAM USER MAPPING SEEDER')
    console.log('   ========================================\n')

    console.log(`ℹ️  This will insert ${SEED_USERS.length} users into telegram_user_mapping table.\n`)

    console.log('Users to be seeded:')
    SEED_USERS.forEach((user) => {
        const handle = user.telegram_handle ? `@${user.telegram_handle}` : '(no handle)'
        console.log(`  • ${user.worker_username} - ${user.first_name} ${user.last_name || ''} ${handle}`)
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

        for (const user of SEED_USERS) {
            try {
                // Check if user already exists
                const existingUser = await pool.query(
                    'SELECT worker_username FROM telegram_user_mapping WHERE worker_username = $1 OR telegram_id = $2',
                    [user.worker_username, user.telegram_id]
                )

                if (existingUser.rows.length > 0) {
                    console.log(`  ⊘ Skipped ${user.worker_username} (already exists)`)
                    skipCount++
                    continue
                }

                // Insert user
                await pool.query(
                    `INSERT INTO telegram_user_mapping
                        (id, worker_username, telegram_id, telegram_handle, first_name, last_name, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        user.id,
                        user.worker_username,
                        user.telegram_id,
                        user.telegram_handle,
                        user.first_name,
                        user.last_name,
                        user.created_at,
                        user.updated_at,
                    ]
                )

                console.log(`  ✓ Inserted ${user.worker_username} (${user.telegram_id})`)
                successCount++
            } catch (error) {
                console.error(`  ✗ Error inserting ${user.worker_username}:`, error)
                errorCount++
            }
        }

        console.log('\n✅ ========================================')
        console.log('   SEEDING COMPLETE!')
        console.log('   ========================================\n')

        console.log('Summary:')
        console.log(`  ✓ ${successCount} users inserted`)
        console.log(`  ⊘ ${skipCount} users skipped (already exist)`)
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
    console.log('   PRODUCTION TELEGRAM USER SEEDING')
    console.log('   ========================================\n')

    console.log(`⚠️  This will seed users on production server!`)
    console.log(`Server: ${PROD_SERVER}`)
    console.log(`Database: ${PROD_DB_NAME}\n`)

    console.log(`ℹ️  ${SEED_USERS.length} users will be inserted.\n`)

    const confirmation = await ask('Type "YES SEED PRODUCTION" to confirm: ')

    if (confirmation.trim() !== 'YES SEED PRODUCTION') {
        console.log('\n❌ Confirmation failed. Seeding cancelled.')
        rl.close()
        process.exit(0)
    }

    console.log('\n🔄 Connecting to production server...\n')

    try {
        // Build SQL commands
        const insertCommands = SEED_USERS.map((user) => {
            const handle = user.telegram_handle ? `'${user.telegram_handle}'` : 'NULL'
            const lastName = user.last_name ? `'${user.last_name}'` : 'NULL'

            return (
                `INSERT INTO telegram_user_mapping ` +
                `(id, worker_username, telegram_id, telegram_handle, first_name, last_name, created_at, updated_at) ` +
                `VALUES ('${user.id}', '${user.worker_username}', '${user.telegram_id}', ${handle}, '${user.first_name}', ${lastName}, '${user.created_at}', '${user.updated_at}') ` +
                `ON CONFLICT (worker_username) DO NOTHING;`
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
        console.log(`  ✓ ${SEED_USERS.length} users seeded`)
        console.log('  ℹ️  Existing users were skipped (ON CONFLICT DO NOTHING)\n')
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
        console.log('  npm run seed:users           # Seed local database')
        console.log('  npm run seed:users:prod      # Seed production database')
        console.log('\nOR:')
        console.log('  tsx scripts/seed-telegram-users.ts --local')
        console.log('  tsx scripts/seed-telegram-users.ts --production')
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
