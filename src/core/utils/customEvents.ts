/**
 * Custom Event Dispatcher
 *
 * Extends BuilderBot's event system with custom semantic events
 * Based on BuilderBot best practices for event-driven architecture
 */

import { createFlowLogger } from './logger'
import type { BotInstance, JsonValue, Personality } from '~/types'

const logger = createFlowLogger('events')

// Custom event names (semantic events for better flow orchestration)
export const CUSTOM_EVENTS = {
    SETUP_COMPLETE: 'SETUP_COMPLETE',
    SETUP_UPDATED: 'SETUP_UPDATED',
} as const

export type CustomEventName = (typeof CUSTOM_EVENTS)[keyof typeof CUSTOM_EVENTS]

export interface CustomEventPayload {
    eventName: CustomEventName
    from: string
    data?: Record<string, JsonValue>
    timestamp: number
}

/**
 * Dispatch a custom event with payload
 * Can be used with bot.dispatch() to trigger flows
 */
export function dispatchCustomEvent(
    bot: BotInstance,
    eventName: CustomEventName,
    from: string,
    data?: Record<string, JsonValue>
): void {
    const payload: CustomEventPayload = {
        eventName,
        from,
        data,
        timestamp: Date.now(),
    }

    logger.info({ payload }, `Custom event dispatched: ${eventName}`)

    // Dispatch event to BuilderBot
    if (bot && bot.dispatch) {
        bot.dispatch(eventName, { from, ...data })
    }
}

/**
 * Setup complete event
 */
export function dispatchSetupComplete(bot: BotInstance | unknown, from: string, personality: Personality): void {
    dispatchCustomEvent(bot as BotInstance, CUSTOM_EVENTS.SETUP_COMPLETE, from, {
        botName: personality.bot_name,
    })
}
