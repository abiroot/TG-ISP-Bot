import { onboardingStateRepository } from '~/database/repositories/onboardingStateRepository.js'
import type {
	OnboardingState,
	CreateOnboardingState,
	UpdateOnboardingState,
	CompleteOnboardingData,
} from '~/database/schemas/onboardingState.js'
import { createFlowLogger } from '~/core/utils/logger.js'
import { OnboardingStateError } from '~/core/errors/OnboardingStateError.js'

const logger = createFlowLogger('onboarding-state-service')

export class OnboardingStateService {
	/**
	 * Initialize onboarding state for a new user
	 */
	async initializeState(
		contextId: string,
		initialData?: Partial<CreateOnboardingState>
	): Promise<OnboardingState> {
		try {
			const state = await onboardingStateRepository.upsert({
				context_id: contextId,
				...initialData,
			})

			logger.info({ contextId }, 'Onboarding state initialized')
			return state
		} catch (error) {
			logger.error(
				{ err: error, contextId },
				'Failed to initialize onboarding state'
			)
			throw new OnboardingStateError(
				'Failed to initialize onboarding state',
				'ONBOARDING_STATE_INIT_ERROR',
				error,
				true
			)
		}
	}

	/**
	 * Save bot name to onboarding state
	 */
	async saveBotName(contextId: string, botName: string): Promise<void> {
		try {
			await onboardingStateRepository.upsert({
				context_id: contextId,
				bot_name: botName,
			})

			logger.info({ contextId, botName }, 'Bot name saved to onboarding state')
		} catch (error) {
			logger.error({ err: error, contextId }, 'Failed to save bot name')
			throw new OnboardingStateError(
				'Failed to save bot name',
				'ONBOARDING_STATE_SAVE_ERROR',
				error,
				true
			)
		}
	}

	/**
	 * Get complete onboarding data (validates all required fields are present)
	 */
	async getCompleteData(
		contextId: string
	): Promise<CompleteOnboardingData | null> {
		try {
			const state = await onboardingStateRepository.get(contextId)

			if (!state) {
				logger.warn({ contextId }, 'No onboarding state found')
				return null
			}

			// Validate all required fields are present
			if (!state.bot_name) {
				logger.warn(
					{
						contextId,
						hasName: !!state.bot_name,
					},
					'Incomplete onboarding state'
				)
				return null
			}

			return {
				bot_name: state.bot_name,
			}
		} catch (error) {
			logger.error({ err: error, contextId }, 'Failed to get onboarding data')
			throw new OnboardingStateError(
				'Failed to retrieve onboarding data',
				'ONBOARDING_STATE_GET_ERROR',
				error,
				true
			)
		}
	}

	/**
	 * Get current onboarding state
	 */
	async getState(contextId: string): Promise<OnboardingState | null> {
		try {
			return await onboardingStateRepository.get(contextId)
		} catch (error) {
			logger.error({ err: error, contextId }, 'Failed to get onboarding state')
			throw new OnboardingStateError(
				'Failed to retrieve onboarding state',
				'ONBOARDING_STATE_GET_ERROR',
				error,
				true
			)
		}
	}

	/**
	 * Clear onboarding state after completion
	 */
	async clearState(contextId: string): Promise<void> {
		try {
			const deleted = await onboardingStateRepository.delete(contextId)

			if (deleted) {
				logger.info({ contextId }, 'Onboarding state cleared')
			} else {
				logger.warn({ contextId }, 'No onboarding state to clear')
			}
		} catch (error) {
			logger.error({ err: error, contextId }, 'Failed to clear onboarding state')
			throw new OnboardingStateError(
				'Failed to clear onboarding state',
				'ONBOARDING_STATE_CLEAR_ERROR',
				error,
				true
			)
		}
	}

	/**
	 * Cleanup old/stale onboarding states
	 * Should be called periodically (e.g., via cron job)
	 */
	async cleanupOldStates(olderThanHours: number = 24): Promise<number> {
		try {
			const deletedCount =
				await onboardingStateRepository.deleteOld(olderThanHours)

			if (deletedCount > 0) {
				logger.info({ deletedCount, olderThanHours }, 'Old onboarding states cleaned up')
			}

			return deletedCount
		} catch (error) {
			logger.error({ err: error }, 'Failed to cleanup old onboarding states')
			throw new OnboardingStateError(
				'Failed to cleanup old states',
				'ONBOARDING_STATE_CLEANUP_ERROR',
				error,
				true
			)
		}
	}
}

export const onboardingStateService = new OnboardingStateService()
