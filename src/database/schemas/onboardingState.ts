/**
 * TypeScript types for the setup_state_temp table
 * Used to store onboarding progress across flow transitions
 */

export interface OnboardingState {
	context_id: string
	bot_name: string | null
	created_at: Date
	updated_at: Date
}

export interface CreateOnboardingState {
	context_id: string
	bot_name?: string
}

export interface UpdateOnboardingState {
	bot_name?: string
}

export interface CompleteOnboardingData {
	bot_name: string
}
