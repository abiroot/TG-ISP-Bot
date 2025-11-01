import { ServiceError } from './ServiceError.js'

/**
 * OnboardingStateError - Errors related to onboarding state management
 *
 * Usage:
 * ```typescript
 * throw new OnboardingStateError(
 *   'Failed to save onboarding state',
 *   'ONBOARDING_STATE_SAVE_ERROR',
 *   error,
 *   true // retryable
 * )
 * ```
 */
export class OnboardingStateError extends ServiceError {
	constructor(
		message: string,
		code: string,
		cause?: unknown,
		retryable: boolean = false
	) {
		super('OnboardingState', message, code, cause, retryable)
	}
}
