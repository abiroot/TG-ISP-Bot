import { z } from 'zod'

const envSchema = z.object({
    // Database
    POSTGRES_DB_HOST: z.string(),
    POSTGRES_DB_USER: z.string(),
    POSTGRES_DB_NAME: z.string(),
    POSTGRES_DB_PASSWORD: z.string().default(''),
    POSTGRES_DB_PORT: z.string().transform(Number),

    // Server
    PORT: z.string().default('3008').transform(Number),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Telegram
    TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),
    WEBHOOK_URL: z.string().url().optional(),

    // OpenAI (used for embeddings)
    OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),

    // Google AI (used for LLM)
    GOOGLE_API_KEY: z.string().min(1, 'Google API key is required'),

    // RAG (Retrieval Augmented Generation) Configuration
    RAG_ENABLED: z
        .string()
        .optional()
        .default('true')
        .transform((val) => val === 'true'),
    RAG_TOP_K_RESULTS: z
        .string()
        .optional()
        .default('3')
        .transform(Number)
        .refine((val) => val >= 1 && val <= 10, 'RAG_TOP_K_RESULTS must be between 1 and 10'),
    RAG_CHUNK_SIZE: z
        .string()
        .optional()
        .default('10')
        .transform(Number)
        .refine((val) => val >= 3 && val <= 20, 'RAG_CHUNK_SIZE must be between 3 and 20'),
    RAG_CHUNK_OVERLAP: z
        .string()
        .optional()
        .default('2')
        .transform(Number)
        .refine((val) => val >= 0 && val <= 10, 'RAG_CHUNK_OVERLAP must be between 0 and 10'),
    RAG_MIN_SIMILARITY: z
        .string()
        .optional()
        .default('0.5')
        .transform(Number)
        .refine((val) => val >= 0 && val <= 1, 'RAG_MIN_SIMILARITY must be between 0 and 1'),
    RAG_EMBEDDING_MODEL: z.string().optional().default('text-embedding-3-small'),

    // RAG Worker Configuration
    RAG_WORKER_ENABLED: z
        .string()
        .optional()
        .default('true')
        .transform((val) => val === 'true'),
    RAG_WORKER_INTERVAL_MS: z
        .string()
        .optional()
        .default('300000')
        .transform(Number)
        .refine((val) => val >= 60000, 'RAG_WORKER_INTERVAL_MS must be at least 60000 (1 minute)'),
    RAG_EMBEDDING_BATCH_SIZE: z
        .string()
        .optional()
        .default('5')
        .transform(Number)
        .refine((val) => val >= 1 && val <= 20, 'RAG_EMBEDDING_BATCH_SIZE must be between 1 and 20'),
    RAG_MESSAGES_THRESHOLD: z
        .string()
        .optional()
        .default('10')
        .transform(Number)
        .refine((val) => val >= 1, 'RAG_MESSAGES_THRESHOLD must be at least 1'),

    // ISP API Configuration
    ISP_API_BASE_URL: z.string().min(1, 'ISP API base URL is required'),
    ISP_API_USERNAME: z.string().min(1, 'ISP API username is required'),
    ISP_API_PASSWORD: z.string().min(1, 'ISP API password is required'),
    ISP_ENABLED: z
        .string()
        .optional()
        .default('true')
        .transform((val) => val === 'true'),
})

export type Env = z.infer<typeof envSchema>

// Validate and export environment variables
const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    throw new Error('Invalid environment variables')
}

export const env = parsed.data
