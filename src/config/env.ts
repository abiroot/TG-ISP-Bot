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

    // OpenAI (used for intent classification)
    OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),

    // Google AI (used for LLM and Maps API)
    GOOGLE_API_KEY: z.string().min(1, 'Google API key is required'),

    // Google Maps Configuration
    GOOGLE_MAPS_ENABLED: z
        .string()
        .optional()
        .default('true')
        .transform((val) => val === 'true'),

    // ISP API Configuration
    ISP_API_BASE_URL: z.string().min(1, 'ISP API base URL is required'),
    ISP_API_USERNAME: z.string().min(1, 'ISP API username is required'),
    ISP_API_PASSWORD: z.string().min(1, 'ISP API password is required'),
    ISP_ENABLED: z
        .string()
        .optional()
        .default('true')
        .transform((val) => val === 'true'),

    // Billing API Configuration
    BILLING_API_BASE_URL: z.string().min(1, 'Billing API base URL is required'),
    BILLING_USERNAME: z.string().min(1, 'Billing username is required'),
    BILLING_PASSWORD: z.string().min(1, 'Billing password is required'),
    BILLING_ENABLED: z
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
