import { pool } from '../../config/database.js'
import { loggers } from '../../core/utils/logger.js'

/**
 * Telegram User Mapping Seed Data
 */
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
        telegram_handle: null,
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

/**
 * Idempotent seeder for telegram_user_mapping table
 *
 * Uses INSERT ... ON CONFLICT to ensure idempotency.
 * Can be safely run multiple times without duplicating data.
 */
export async function seedTelegramUsers(): Promise<void> {
    const logger = loggers.app.child({ module: 'telegramUserSeeder' })

    logger.info('🌱 Seeding telegram_user_mapping table...')

    let insertedCount = 0
    let skippedCount = 0

    try {
        for (const user of SEED_USERS) {
            try {
                // Idempotent insert: ON CONFLICT (worker_username) DO NOTHING
                const result = await pool.query(
                    `INSERT INTO telegram_user_mapping
                        (id, worker_username, telegram_id, telegram_handle, first_name, last_name, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (worker_username) DO NOTHING
                     RETURNING worker_username`,
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

                if (result.rowCount && result.rowCount > 0) {
                    logger.debug(`  ✓ Inserted user: ${user.worker_username}`)
                    insertedCount++
                } else {
                    logger.debug(`  ⊘ Skipped user (already exists): ${user.worker_username}`)
                    skippedCount++
                }
            } catch (error) {
                logger.error({ err: error, user: user.worker_username }, `Failed to seed user: ${user.worker_username}`)
                throw error
            }
        }

        logger.info(
            `✅ Telegram user seeding complete: ${insertedCount} inserted, ${skippedCount} skipped`
        )
    } catch (error) {
        logger.error({ err: error }, 'Failed to seed telegram users')
        throw error
    }
}
