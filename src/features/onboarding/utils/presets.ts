/**
 * Onboarding Presets
 *
 * Preset options for bot name selection during onboarding.
 */

export interface BotNamePreset {
    name: string
    emoji: string
    description: string
}

export const BOT_NAME_PRESETS: BotNamePreset[] = [
    {
        name: 'ISPSupport',
        emoji: '🏢',
        description: 'Professional ISP support assistant'
    },
    {
        name: 'HelpDesk',
        emoji: '🤖',
        description: 'Friendly help desk assistant'
    },
    {
        name: 'Assistant',
        emoji: '💬',
        description: 'General purpose assistant'
    }
]

export const ONBOARDING_STEPS = {
    WELCOME: 0,
    BOT_NAME: 1,
    LANGUAGE: 2,
    TIMEZONE: 3,
    PREVIEW: 4,
    COMPLETE: 5
} as const

export type OnboardingStep = typeof ONBOARDING_STEPS[keyof typeof ONBOARDING_STEPS]
