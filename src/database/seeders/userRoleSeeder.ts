import { pool } from '../../config/database.js'
import { loggers } from '../../core/utils/logger.js'
import type { RoleName } from '../../config/roles.js'

/**
 * Role assignment seed data
 */
interface RoleAssignment {
    telegram_id: string
    role: RoleName
    assigned_by: string
    notes: string
}

const ROLE_ASSIGNMENTS: RoleAssignment[] = [
    // its (1473818060) - collector + worker
    {
        telegram_id: '1473818060',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - its (@rbob98) - Collector',
    },
    {
        telegram_id: '1473818060',
        role: 'worker',
        assigned_by: 'system',
        notes: 'Seeded role - its (@rbob98) - Worker',
    },
    // ibrahim (8177411078) - collector + worker
    {
        telegram_id: '8177411078',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - ibrahim (@ibrahimtaktak) - Collector',
    },
    {
        telegram_id: '8177411078',
        role: 'worker',
        assigned_by: 'system',
        notes: 'Seeded role - ibrahim (@ibrahimtaktak) - Worker',
    },
    // marwan (8480834371) - collector + worker
    {
        telegram_id: '8480834371',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - marwan (no handle) - Collector',
    },
    {
        telegram_id: '8480834371',
        role: 'worker',
        assigned_by: 'system',
        notes: 'Seeded role - marwan (no handle) - Worker',
    },
    // mohamad (5299501436) - collector only
    {
        telegram_id: '5299501436',
        role: 'collector',
        assigned_by: 'system',
        notes: 'Seeded role - mohamad (@mohamadomar12) - Collector',
    },
]

/**
 * Idempotent seeder for user_roles table
 *
 * Uses INSERT ... ON CONFLICT to ensure idempotency.
 * Can be safely run multiple times without duplicating data.
 */
export async function seedUserRoles(): Promise<void> {
    const logger = loggers.app.child({ module: 'userRoleSeeder' })

    logger.info('🌱 Seeding user_roles table...')

    let insertedCount = 0
    let skippedCount = 0

    try {
        for (const assignment of ROLE_ASSIGNMENTS) {
            try {
                // Idempotent insert: ON CONFLICT (user_telegram_id, role) DO NOTHING
                const result = await pool.query(
                    `INSERT INTO user_roles (user_telegram_id, role, assigned_by, notes)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_telegram_id, role) DO NOTHING
                     RETURNING id`,
                    [assignment.telegram_id, assignment.role, assignment.assigned_by, assignment.notes]
                )

                if (result.rowCount && result.rowCount > 0) {
                    logger.debug(
                        `  ✓ Assigned ${assignment.role} role to user ${assignment.telegram_id}`
                    )
                    insertedCount++
                } else {
                    logger.debug(
                        `  ⊘ Skipped (already exists): ${assignment.role} for user ${assignment.telegram_id}`
                    )
                    skippedCount++
                }
            } catch (error) {
                logger.error(
                    { err: error, assignment },
                    `Failed to seed role: ${assignment.role} for user ${assignment.telegram_id}`
                )
                throw error
            }
        }

        logger.info(`✅ User role seeding complete: ${insertedCount} inserted, ${skippedCount} skipped`)
    } catch (error) {
        logger.error({ err: error }, 'Failed to seed user roles')
        throw error
    }
}
