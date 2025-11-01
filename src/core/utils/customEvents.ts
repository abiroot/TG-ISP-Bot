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
    TRANSCRIPTION_COMPLETE: 'TRANSCRIPTION_COMPLETE',
    IMAGE_ANALYSIS_COMPLETE: 'IMAGE_ANALYSIS_COMPLETE',
    AI_RESPONSE_GENERATED: 'AI_RESPONSE_GENERATED',
    USER_WHITELISTED: 'USER_WHITELISTED',
    USER_REMOVED_FROM_WHITELIST: 'USER_REMOVED_FROM_WHITELIST',
    MAINTENANCE_MODE_ENABLED: 'MAINTENANCE_MODE_ENABLED',
    MAINTENANCE_MODE_DISABLED: 'MAINTENANCE_MODE_DISABLED',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    FEATURE_TOGGLED: 'FEATURE_TOGGLED',
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
        timezone: personality.default_timezone,
        language: personality.default_language,
    })
}

/**
 * Transcription complete event
 */
export function dispatchTranscriptionComplete(bot: BotInstance, from: string, transcription: string): void {
    dispatchCustomEvent(bot, CUSTOM_EVENTS.TRANSCRIPTION_COMPLETE, from, {
        transcription: transcription.substring(0, 100), // First 100 chars for logging
        length: transcription.length,
    })
}

/**
 * Image analysis complete event
 */
export function dispatchImageAnalysisComplete(bot: BotInstance, from: string, analysis: { content?: string }): void {
    dispatchCustomEvent(bot, CUSTOM_EVENTS.IMAGE_ANALYSIS_COMPLETE, from, {
        hasContent: (analysis.content?.length ?? 0) > 0,
        contentLength: analysis.content?.length ?? 0,
    })
}

/**
 * AI response generated event
 */
export function dispatchAIResponseGenerated(bot: BotInstance, from: string, responseLength: number, durationMs: number): void {
    dispatchCustomEvent(bot, CUSTOM_EVENTS.AI_RESPONSE_GENERATED, from, {
        responseLength,
        durationMs,
    })
}

/**
 * User whitelisted event
 */
export function dispatchUserWhitelisted(
    bot: BotInstance,
    from: string,
    targetId: string,
    type: 'group' | 'number',
    addedBy: string
): void {
    dispatchCustomEvent(bot, CUSTOM_EVENTS.USER_WHITELISTED, from, {
        targetId,
        type,
        addedBy,
    })
}

/**
 * Maintenance mode toggled event
 */
export function dispatchMaintenanceModeToggled(bot: BotInstance, enabled: boolean, triggeredBy: string): void {
    const eventName = enabled ? CUSTOM_EVENTS.MAINTENANCE_MODE_ENABLED : CUSTOM_EVENTS.MAINTENANCE_MODE_DISABLED

    dispatchCustomEvent(bot, eventName, triggeredBy, {
        enabled,
    })
}

/**
 * Rate limit exceeded event
 */
export function dispatchRateLimitExceeded(bot: BotInstance, from: string, count: number, maxRequests: number): void {
    dispatchCustomEvent(bot, CUSTOM_EVENTS.RATE_LIMIT_EXCEEDED, from, {
        count,
        maxRequests,
        exceededBy: count - maxRequests,
    })
}

/**
 * Feature toggled event
 */
export function dispatchFeatureToggled(
    bot: BotInstance,
    feature: string,
    enabled: boolean,
    triggeredBy: string
): void {
    dispatchCustomEvent(bot, CUSTOM_EVENTS.FEATURE_TOGGLED, triggeredBy, {
        feature,
        enabled,
    })
}
