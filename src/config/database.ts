import { Pool } from 'pg'
import { env } from './env'
import { loggers } from '~/core/utils/logger'

// Create a PostgreSQL connection pool
export const pool = new Pool({
    host: env.POSTGRES_DB_HOST,
    user: env.POSTGRES_DB_USER,
    database: env.POSTGRES_DB_NAME,
    password: env.POSTGRES_DB_PASSWORD,
    port: env.POSTGRES_DB_PORT,
})

pool.on('error', (err) => {
    loggers.app.fatal({ err }, 'Unexpected error on idle client')
    process.exit(-1)
})

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
    try {
        const client = await pool.connect()
        await client.query('SELECT NOW()')
        client.release()
        loggers.app.info('Database connection successful')
        return true
    } catch (error) {
        loggers.app.error({ err: error }, 'Database connection failed')
        return false
    }
}

/**
 * Close database connection pool
 */
export async function closeConnection(): Promise<void> {
    await pool.end()
    loggers.app.info('Database connection closed')
}
