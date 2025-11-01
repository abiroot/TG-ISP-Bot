/**
 * Timeout utilities for flow capture states
 */

import type { BotContext, BotMethods } from '@builderbot/bot/dist/types'
import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('FlowTimeout')

export const TIMEOUT_PRESETS = {
  SETUP: 5 * 60 * 1000, // 5 minutes for personality setup
  QUERY: 2 * 60 * 1000, // 2 minutes for queries
  CONFIRMATION: 60 * 1000, // 1 minute for confirmations
  SHORT: 30 * 1000 // 30 seconds for quick actions
} as const

interface TimeoutTimer {
  id: NodeJS.Timeout
  warningId?: NodeJS.Timeout
}

const activeTimers = new Map<string, TimeoutTimer>()

/**
 * Start an idle timer for a flow capture state
 *
 * @param ctx - Bot context
 * @param state - State methods
 * @param timeoutMs - Timeout duration in milliseconds
 * @param onTimeout - Callback when timeout occurs
 * @param warningBeforeMs - Optional warning time before timeout (default: 30s before)
 */
export async function startIdleTimer(
  ctx: BotContext,
  state: BotMethods['state'],
  timeoutMs: number,
  onTimeout: () => Promise<void> | void,
  warningBeforeMs: number = 30000
): Promise<void> {
  const timerId = `${ctx.from}_${Date.now()}`

  // Clear any existing timer for this user
  await clearIdleTimer(ctx.from)

  // Store timer ID in state to track it
  await state.update({ _timer_id: timerId, _timer_started: true })

  const timer: TimeoutTimer = {
    id: setTimeout(async () => {
      try {
        logger.info({ from: ctx.from, timeoutMs }, 'Idle timer expired')

        // Clear from active timers
        activeTimers.delete(ctx.from)

        // Execute timeout callback
        await onTimeout()
      } catch (error) {
        logger.error({ err: error, from: ctx.from }, 'Error in timeout callback')
      }
    }, timeoutMs)
  }

  // Add warning timer if requested and timeout is long enough
  if (warningBeforeMs > 0 && timeoutMs > warningBeforeMs) {
    timer.warningId = setTimeout(() => {
      logger.info(
        { from: ctx.from, remainingMs: warningBeforeMs },
        'Timeout warning triggered'
      )
      // Warning is handled by caller via state check
    }, timeoutMs - warningBeforeMs)
  }

  activeTimers.set(ctx.from, timer)

  logger.info(
    { from: ctx.from, timeoutMs, hasWarning: !!timer.warningId },
    'Idle timer started'
  )
}

/**
 * Clear idle timer for a user
 */
export async function clearIdleTimer(userId: string): Promise<void> {
  const timer = activeTimers.get(userId)

  if (timer) {
    clearTimeout(timer.id)
    if (timer.warningId) {
      clearTimeout(timer.warningId)
    }
    activeTimers.delete(userId)

    logger.info({ from: userId }, 'Idle timer cleared')
  }
}

/**
 * Reset idle timer (clear and restart)
 */
export async function resetIdleTimer(
  ctx: BotContext,
  state: BotMethods['state'],
  timeoutMs: number,
  onTimeout: () => Promise<void> | void,
  warningBeforeMs?: number
): Promise<void> {
  await clearIdleTimer(ctx.from)
  await startIdleTimer(ctx, state, timeoutMs, onTimeout, warningBeforeMs)
}

/**
 * Check if a timer is active for a user
 */
export function hasActiveTimer(userId: string): boolean {
  return activeTimers.has(userId)
}

/**
 * Clear all active timers (useful for shutdown)
 */
export function clearAllTimers(): void {
  for (const [userId, timer] of activeTimers.entries()) {
    clearTimeout(timer.id)
    if (timer.warningId) {
      clearTimeout(timer.warningId)
    }
  }
  activeTimers.clear()

  logger.info('All idle timers cleared')
}
