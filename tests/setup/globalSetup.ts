/**
 * Global setup for Vitest
 * Loads environment variables for tests
 */
import { config } from 'dotenv'

// Load .env file before tests run
config()

// Ensure test environment
process.env.NODE_ENV = 'test'

console.log('✅ Test environment loaded')
