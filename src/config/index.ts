/**
 * Configuration Module
 *
 * Central export point for all configuration.
 * Import from here instead of individual config files.
 *
 * @example
 * ```typescript
 * import { env, pool, admins } from '~/config'
 * ```
 */

// Environment variables (validated with Zod)
export { env, type Env } from './env'

// Database connection pool
export { pool, testConnection } from './database'

// Admin user identifiers
export { admins, isAdmin } from './admins'
