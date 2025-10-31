/**
 * Centralized Application Configuration
 *
 * Single source of truth for all app configuration.
 * Validates all environment variables at startup.
 */

import { env } from './env'
import { pool } from './database'
import { admins } from './admins'

/**
 * Database configuration
 */
export interface DatabaseConfig {
    host: string
    port: number
    user: string
    password: string
    database: string
    pool: typeof pool
}

/**
 * AI configuration
 */
export interface AIConfig {
    model: string
    embeddingModel: string
    maxTokens: number
    contextWindow: number
    temperature: number
}

/**
 * RAG configuration
 */
export interface RAGConfig {
    enabled: boolean
    chunkSize: number
    chunkOverlap: number
    topK: number
    minSimilarity: number
    workerEnabled: boolean
    workerIntervalMs: number
    batchSize: number
    messagesThreshold: number
}

/**
 * ISP configuration
 */
export interface ISPConfig {
    enabled: boolean
    baseUrl: string
    username: string
    password: string
}

/**
 * Bot configuration
 */
export interface BotConfig {
    version: string
    port: number
    telegramToken: string
    admins: string[]
}

/**
 * Feature flags
 */
export interface FeatureFlags {
    aiResponses: boolean
    ragEnabled: boolean
    voiceTranscription: boolean
    imageAnalysis: boolean
    ispTools: boolean
    rateLimiting: boolean
    buttonDemos: boolean
    testFlows: boolean
}

/**
 * Application Configuration
 */
export class AppConfig {
    readonly database: DatabaseConfig
    readonly ai: AIConfig
    readonly rag: RAGConfig
    readonly isp: ISPConfig
    readonly bot: BotConfig
    readonly features: FeatureFlags
    readonly isDevelopment: boolean
    readonly isProduction: boolean
    readonly isTest: boolean

    constructor() {
        this.database = {
            host: env.POSTGRES_DB_HOST,
            port: env.POSTGRES_DB_PORT,
            user: env.POSTGRES_DB_USER,
            password: env.POSTGRES_DB_PASSWORD,
            database: env.POSTGRES_DB_NAME,
            pool,
        }

        this.ai = {
            model: 'gemini-2.0-flash',
            embeddingModel: env.RAG_EMBEDDING_MODEL,
            maxTokens: 8192,
            contextWindow: 1048576, // 1M tokens
            temperature: 0.7,
        }

        this.rag = {
            enabled: env.RAG_ENABLED,
            chunkSize: env.RAG_CHUNK_SIZE,
            chunkOverlap: env.RAG_CHUNK_OVERLAP,
            topK: env.RAG_TOP_K_RESULTS,
            minSimilarity: env.RAG_MIN_SIMILARITY,
            workerEnabled: env.RAG_WORKER_ENABLED,
            workerIntervalMs: env.RAG_WORKER_INTERVAL_MS,
            batchSize: env.RAG_EMBEDDING_BATCH_SIZE,
            messagesThreshold: env.RAG_MESSAGES_THRESHOLD,
        }

        this.isp = {
            enabled: env.ISP_ENABLED,
            baseUrl: env.ISP_API_BASE_URL,
            username: env.ISP_API_USERNAME,
            password: env.ISP_API_PASSWORD,
        }

        this.bot = {
            version: process.env.npm_package_version || '1.0.0',
            port: env.PORT,
            telegramToken: env.TELEGRAM_BOT_TOKEN,
            admins,
        }

        this.features = {
            aiResponses: true,
            ragEnabled: env.RAG_ENABLED,
            voiceTranscription: true,
            imageAnalysis: true,
            ispTools: env.ISP_ENABLED,
            rateLimiting: true,
            buttonDemos: env.NODE_ENV === 'development',
            testFlows: env.NODE_ENV === 'development',
        }

        this.isDevelopment = env.NODE_ENV === 'development'
        this.isProduction = env.NODE_ENV === 'production'
        this.isTest = env.NODE_ENV === 'test'
    }

    /**
     * Get configuration as JSON (for debugging)
     */
    toJSON(): Record<string, any> {
        return {
            database: {
                ...this.database,
                password: '***REDACTED***',
                pool: '[PostgreSQL Pool]',
            },
            ai: this.ai,
            rag: this.rag,
            isp: {
                ...this.isp,
                password: '***REDACTED***',
            },
            bot: {
                ...this.bot,
                telegramToken: '***REDACTED***',
            },
            features: this.features,
            environment: {
                isDevelopment: this.isDevelopment,
                isProduction: this.isProduction,
                isTest: this.isTest,
            },
        }
    }

    /**
     * Validate configuration at startup
     */
    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = []

        // Database
        if (!this.database.host) errors.push('Database host is required')
        if (!this.database.database) errors.push('Database name is required')

        // Bot
        if (!this.bot.telegramToken) errors.push('Telegram bot token is required')
        if (this.bot.admins.length === 0) errors.push('At least one admin is required')

        // ISP (if enabled)
        if (this.isp.enabled) {
            if (!this.isp.baseUrl) errors.push('ISP API base URL is required when ISP is enabled')
            if (!this.isp.username) errors.push('ISP API username is required when ISP is enabled')
        }

        return {
            valid: errors.length === 0,
            errors,
        }
    }
}

/**
 * Global app configuration instance
 */
export const appConfig = new AppConfig()

// Validate on module load
const validation = appConfig.validate()
if (!validation.valid) {
    console.error('❌ Configuration validation failed:')
    validation.errors.forEach((error) => console.error(`  - ${error}`))
    throw new Error('Invalid configuration')
}
