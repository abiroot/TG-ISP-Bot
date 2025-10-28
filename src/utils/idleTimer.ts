/**
 * Idle Timer Utility
 *
 * Manages inactivity timers for conversation flows.
 * Based on BuilderBot best practices for handling user timeout scenarios.
 */

import type { BotMethods } from '@builderbot/bot/dist/types'

interface IdleTimer {
    timerId: NodeJS.Timeout
    contextId: string
}

class IdleTimerManager {
    private timers: Map<string, IdleTimer> = new Map()

    /**
     * Start an inactivity timer for a context
     * @param ctx Bot context
     * @param gotoFlow Function to navigate to timeout flow
     * @param timeoutMs Timeout duration in milliseconds
     * @param onTimeout Optional custom timeout handler
     */
    start(
        ctx: any,
        gotoFlow: BotMethods<any, any>['gotoFlow'],
        timeoutMs: number,
        onTimeout?: () => Promise<void>
    ): void {
        const contextId = ctx.from

        // Clear existing timer if any
        this.stop(ctx)

        // Create new timer
        const timerId = setTimeout(async () => {
            console.log(`⏰ Idle timeout triggered for ${contextId}`)

            if (onTimeout) {
                await onTimeout()
            }

            // Clean up timer reference
            this.timers.delete(contextId)
        }, timeoutMs)

        // Store timer
        this.timers.set(contextId, { timerId, contextId })
        console.log(`⏱️  Idle timer started for ${contextId} (${timeoutMs}ms)`)
    }

    /**
     * Reset the inactivity timer (e.g., when user sends a message)
     * @param ctx Bot context
     * @param gotoFlow Function to navigate to timeout flow
     * @param timeoutMs Timeout duration in milliseconds
     * @param onTimeout Optional custom timeout handler
     */
    reset(
        ctx: any,
        gotoFlow: BotMethods<any, any>['gotoFlow'],
        timeoutMs: number,
        onTimeout?: () => Promise<void>
    ): void {
        const contextId = ctx.from
        console.log(`🔄 Resetting idle timer for ${contextId}`)

        // Stop existing timer and start a new one
        this.stop(ctx)
        this.start(ctx, gotoFlow, timeoutMs, onTimeout)
    }

    /**
     * Stop the inactivity timer
     * @param ctx Bot context
     */
    stop(ctx: any): void {
        const contextId = ctx.from
        const timer = this.timers.get(contextId)

        if (timer) {
            clearTimeout(timer.timerId)
            this.timers.delete(contextId)
            console.log(`⏹️  Idle timer stopped for ${contextId}`)
        }
    }

    /**
     * Check if a timer is active for a context
     * @param ctx Bot context
     * @returns true if timer is active
     */
    isActive(ctx: any): boolean {
        return this.timers.has(ctx.from)
    }

    /**
     * Clear all timers (useful for cleanup)
     */
    clearAll(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer.timerId)
        }
        this.timers.clear()
        console.log('🧹 All idle timers cleared')
    }
}

// Export singleton instance
export const idleTimer = new IdleTimerManager()

// Convenience functions for easier usage in flows
export const startIdleTimer = (
    ctx: any,
    gotoFlow: BotMethods<any, any>['gotoFlow'],
    timeoutMs: number,
    onTimeout?: () => Promise<void>
) => idleTimer.start(ctx, gotoFlow, timeoutMs, onTimeout)

export const resetIdleTimer = (
    ctx: any,
    gotoFlow: BotMethods<any, any>['gotoFlow'],
    timeoutMs: number,
    onTimeout?: () => Promise<void>
) => idleTimer.reset(ctx, gotoFlow, timeoutMs, onTimeout)

export const stopIdleTimer = (ctx: any) => idleTimer.stop(ctx)
