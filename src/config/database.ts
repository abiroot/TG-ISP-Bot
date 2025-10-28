import { Pool } from 'pg'
import { env } from './env'

// Create a PostgreSQL connection pool
export const pool = new Pool({
    host: env.POSTGRES_DB_HOST,
    user: env.POSTGRES_DB_USER,
    database: env.POSTGRES_DB_NAME,
    password: env.POSTGRES_DB_PASSWORD,
    port: env.POSTGRES_DB_PORT,
})

pool.on('error', (err) => {
    console.error('💥 Unexpected error on idle client', err)
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
        console.log('✅ Database connection successful')
        return true
    } catch (error) {
        console.error('❌ Database connection failed:', error)
        return false
    }
}

/**
 * Close database connection pool
 */
export async function closeConnection(): Promise<void> {
    await pool.end()
    console.log('🔌 Database connection closed')
}
