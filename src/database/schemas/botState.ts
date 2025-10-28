/**
 * Bot State Schema
 *
 * Stores persistent bot-wide configuration that survives restarts
 * - Maintenance mode status
 * - Feature flags
 * - Global settings
 */

export interface BotState {
    key: string // Unique identifier for the state entry
    value: Record<string, any> // JSON value
    updated_at: Date
}

export interface CreateBotState {
    key: string
    value: Record<string, any>
}

export interface UpdateBotState {
    value?: Record<string, any>
}

// Predefined state keys for type safety
export const BOT_STATE_KEYS = {
    MAINTENANCE_MODE: 'maintenance_mode',
    FEATURES_ENABLED: 'features_enabled',
    RATE_LIMITER: 'rate_limiter',
} as const

export type BotStateKey = (typeof BOT_STATE_KEYS)[keyof typeof BOT_STATE_KEYS]

// Type-safe state value interfaces
export interface MaintenanceModeState {
    enabled: boolean
    message?: string
    enabled_at?: string
    enabled_by?: string
}

export interface FeaturesEnabledState {
    ai_responses: boolean
    voice_transcription: boolean
    image_analysis: boolean
}
