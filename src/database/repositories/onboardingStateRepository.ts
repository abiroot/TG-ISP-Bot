import { pool } from '~/config/database.js'
import type {
	OnboardingState,
	CreateOnboardingState,
	UpdateOnboardingState,
} from '~/database/schemas/onboardingState.js'

export class OnboardingStateRepository {
	/**
	 * Create or replace onboarding state for a context
	 */
	async upsert(data: CreateOnboardingState): Promise<OnboardingState> {
		const result = await pool.query(
			`INSERT INTO setup_state_temp (context_id, bot_name, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (context_id)
       DO UPDATE SET
         bot_name = COALESCE($2, setup_state_temp.bot_name),
         updated_at = NOW()
       RETURNING *`,
			[
				data.context_id,
				data.bot_name ?? null,
			]
		)
		return result.rows[0]
	}

	/**
	 * Get onboarding state for a context
	 */
	async get(contextId: string): Promise<OnboardingState | null> {
		const result = await pool.query(
			`SELECT * FROM setup_state_temp WHERE context_id = $1`,
			[contextId]
		)
		return result.rows[0] ?? null
	}

	/**
	 * Update existing onboarding state (partial update)
	 */
	async update(
		contextId: string,
		data: UpdateOnboardingState
	): Promise<OnboardingState | null> {
		const setClauses: string[] = []
		const values: any[] = [contextId]
		let paramIndex = 2

		if (data.bot_name !== undefined) {
			setClauses.push(`bot_name = $${paramIndex}`)
			values.push(data.bot_name)
			paramIndex++
		}

		if (setClauses.length === 0) {
			return this.get(contextId)
		}

		setClauses.push('updated_at = NOW()')

		const result = await pool.query(
			`UPDATE setup_state_temp
       SET ${setClauses.join(', ')}
       WHERE context_id = $1
       RETURNING *`,
			values
		)

		return result.rows[0] ?? null
	}

	/**
	 * Delete onboarding state for a context
	 */
	async delete(contextId: string): Promise<boolean> {
		const result = await pool.query(
			`DELETE FROM setup_state_temp WHERE context_id = $1`,
			[contextId]
		)
		return (result.rowCount ?? 0) > 0
	}

	/**
	 * Delete old onboarding states (cleanup stale sessions)
	 * @param olderThanHours Delete states older than this many hours
	 */
	async deleteOld(olderThanHours: number = 24): Promise<number> {
		const result = await pool.query(
			`DELETE FROM setup_state_temp
       WHERE created_at < NOW() - INTERVAL '${olderThanHours} hours'`
		)
		return result.rowCount ?? 0
	}
}

export const onboardingStateRepository = new OnboardingStateRepository()
