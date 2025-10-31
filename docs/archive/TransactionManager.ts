/**
 * Transaction Manager
 *
 * Provides transaction support for database operations.
 * Ensures ACID properties for multi-step operations.
 *
 * @example
 * ```typescript
 * await transactionManager.withTransaction(async (client) => {
 *   await client.query('INSERT INTO users ...')
 *   await client.query('INSERT INTO messages ...')
 *   // Both succeed or both rollback
 * })
 * ```
 */

import { pool } from '~/config/database'
import type { PoolClient, QueryResult } from 'pg'
import { createFlowLogger } from '~/utils/logger'

const txLogger = createFlowLogger('transaction-manager')

/**
 * Transaction options
 */
export interface TransactionOptions {
    /** Transaction isolation level */
    isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'

    /** Transaction timeout in milliseconds */
    timeout?: number

    /** Maximum retry attempts on serialization failure */
    maxRetries?: number
}

/**
 * Transaction callback function
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>

/**
 * Transaction Manager
 */
export class TransactionManager {
    /**
     * Execute a callback within a database transaction
     *
     * @param callback - Function to execute within transaction
     * @param options - Transaction options
     * @returns Result from callback
     */
    async withTransaction<T>(
        callback: TransactionCallback<T>,
        options: TransactionOptions = {}
    ): Promise<T> {
        const {
            isolationLevel = 'READ COMMITTED',
            timeout = 30000,
            maxRetries = 3,
        } = options

        let attempt = 0

        while (attempt < maxRetries) {
            attempt++
            const client = await pool.connect()

            try {
                // Start transaction with isolation level
                await client.query(`BEGIN ISOLATION LEVEL ${isolationLevel}`)

                // Set statement timeout
                if (timeout) {
                    await client.query(`SET LOCAL statement_timeout = ${timeout}`)
                }

                txLogger.debug(
                    { isolationLevel, timeout, attempt },
                    'Transaction started'
                )

                // Execute callback
                const result = await callback(client)

                // Commit transaction
                await client.query('COMMIT')

                txLogger.debug({ attempt }, 'Transaction committed')

                return result
            } catch (error: any) {
                // Rollback transaction
                try {
                    await client.query('ROLLBACK')
                    txLogger.debug({ attempt }, 'Transaction rolled back')
                } catch (rollbackError) {
                    txLogger.error(
                        { err: rollbackError },
                        'Failed to rollback transaction'
                    )
                }

                // Check if error is retriable (serialization failure)
                const isRetriable =
                    error.code === '40001' || // serialization_failure
                    error.code === '40P01' // deadlock_detected

                if (isRetriable && attempt < maxRetries) {
                    txLogger.warn(
                        { err: error, attempt, maxRetries },
                        'Transaction failed, retrying'
                    )

                    // Exponential backoff
                    await this.sleep(Math.pow(2, attempt) * 100)
                    continue
                }

                // Non-retriable error or max retries exceeded
                txLogger.error(
                    { err: error, attempt, isRetriable },
                    'Transaction failed'
                )
                throw error
            } finally {
                // Release client back to pool
                client.release()
            }
        }

        throw new Error('Transaction failed after maximum retries')
    }

    /**
     * Execute multiple operations in a single transaction
     *
     * @param operations - Array of operations to execute
     * @param options - Transaction options
     * @returns Array of results
     */
    async batch<T>(
        operations: Array<(client: PoolClient) => Promise<T>>,
        options?: TransactionOptions
    ): Promise<T[]> {
        return this.withTransaction(async (client) => {
            const results: T[] = []

            for (const operation of operations) {
                const result = await operation(client)
                results.push(result)
            }

            return results
        }, options)
    }

    /**
     * Execute a query within a transaction
     *
     * Helper method for simple queries
     */
    async query<T = any>(
        text: string,
        params?: any[],
        options?: TransactionOptions
    ): Promise<QueryResult<T>> {
        return this.withTransaction(async (client) => {
            return client.query<T>(text, params)
        }, options)
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Create a savepoint within a transaction
     *
     * @param client - Transaction client
     * @param name - Savepoint name
     */
    async savepoint(client: PoolClient, name: string): Promise<void> {
        await client.query(`SAVEPOINT ${name}`)
        txLogger.debug({ savepoint: name }, 'Savepoint created')
    }

    /**
     * Rollback to a savepoint
     *
     * @param client - Transaction client
     * @param name - Savepoint name
     */
    async rollbackToSavepoint(client: PoolClient, name: string): Promise<void> {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`)
        txLogger.debug({ savepoint: name }, 'Rolled back to savepoint')
    }

    /**
     * Release a savepoint
     *
     * @param client - Transaction client
     * @param name - Savepoint name
     */
    async releaseSavepoint(client: PoolClient, name: string): Promise<void> {
        await client.query(`RELEASE SAVEPOINT ${name}`)
        txLogger.debug({ savepoint: name }, 'Savepoint released')
    }
}

/**
 * Global transaction manager instance
 */
export const transactionManager = new TransactionManager()

/**
 * Helper function for transaction execution
 *
 * @example
 * ```typescript
 * await withTransaction(async (client) => {
 *   // Your transactional code here
 * })
 * ```
 */
export async function withTransaction<T>(
    callback: TransactionCallback<T>,
    options?: TransactionOptions
): Promise<T> {
    return transactionManager.withTransaction(callback, options)
}
