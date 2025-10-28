/**
 * Rate Limiter Utility
 *
 * Implements sliding window rate limiting per user to prevent spam/abuse
 * Based on token bucket algorithm with time-based expiration
 */

import { loggers } from '~/utils/logger'

interface RateLimitEntry {
    count: number
    firstRequest: number
    lastRequest: number
}

interface RateLimitConfig {
    maxRequests: number // Maximum requests allowed
    windowMs: number // Time window in milliseconds
    blockDurationMs?: number // How long to block after exceeding limit
}

class RateLimiterManager {
    private limits: Map<string, RateLimitEntry> = new Map()
    private blocked: Map<string, number> = new Map() // contextId -> unblock timestamp

    // Default configuration
    private readonly DEFAULT_CONFIG: RateLimitConfig = {
        maxRequests: 20, // 20 messages
        windowMs: 60 * 1000, // per minute
        blockDurationMs: 5 * 60 * 1000, // block for 5 minutes
    }

    /**
     * Check if a user is rate limited
     * @returns true if allowed, false if rate limited
     */
    check(contextId: string, config: Partial<RateLimitConfig> = {}): boolean {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config }
        const now = Date.now()

        // Check if user is currently blocked
        const unblockTime = this.blocked.get(contextId)
        if (unblockTime && now < unblockTime) {
            const remainingMs = unblockTime - now
            loggers.middleware.warn(
                {
                    contextId,
                    remainingMs,
                    remainingSec: Math.ceil(remainingMs / 1000),
                },
                'User is rate limited (blocked)'
            )
            return false
        }

        // Remove expired block
        if (unblockTime && now >= unblockTime) {
            this.blocked.delete(contextId)
            loggers.middleware.info({ contextId }, 'Rate limit block expired')
        }

        // Get or create rate limit entry
        let entry = this.limits.get(contextId)

        if (!entry) {
            // First request - create new entry
            entry = {
                count: 1,
                firstRequest: now,
                lastRequest: now,
            }
            this.limits.set(contextId, entry)
            return true
        }

        // Check if window has expired
        const windowAge = now - entry.firstRequest
        if (windowAge > finalConfig.windowMs) {
            // Window expired - reset
            entry.count = 1
            entry.firstRequest = now
            entry.lastRequest = now
            this.limits.set(contextId, entry)
            return true
        }

        // Within window - check limit
        if (entry.count >= finalConfig.maxRequests) {
            // Rate limit exceeded
            loggers.middleware.warn(
                {
                    contextId,
                    count: entry.count,
                    maxRequests: finalConfig.maxRequests,
                    windowMs: finalConfig.windowMs,
                },
                'Rate limit exceeded'
            )

            // Block user
            if (finalConfig.blockDurationMs) {
                this.blocked.set(contextId, now + finalConfig.blockDurationMs)
                loggers.middleware.info(
                    {
                        contextId,
                        blockDurationMs: finalConfig.blockDurationMs,
                    },
                    'User blocked for rate limit violation'
                )
            }

            return false
        }

        // Increment count
        entry.count++
        entry.lastRequest = now
        this.limits.set(contextId, entry)

        // Log warning if approaching limit
        if (entry.count >= finalConfig.maxRequests * 0.8) {
            loggers.middleware.warn(
                {
                    contextId,
                    count: entry.count,
                    maxRequests: finalConfig.maxRequests,
                    remaining: finalConfig.maxRequests - entry.count,
                },
                'User approaching rate limit'
            )
        }

        return true
    }

    /**
     * Get current rate limit status for a user
     */
    getStatus(contextId: string, config: Partial<RateLimitConfig> = {}) {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config }
        const entry = this.limits.get(contextId)
        const unblockTime = this.blocked.get(contextId)
        const now = Date.now()

        if (!entry) {
            return {
                count: 0,
                maxRequests: finalConfig.maxRequests,
                remaining: finalConfig.maxRequests,
                windowMs: finalConfig.windowMs,
                blocked: false,
            }
        }

        const windowAge = now - entry.firstRequest
        const isExpired = windowAge > finalConfig.windowMs
        const isBlocked = unblockTime ? now < unblockTime : false

        return {
            count: isExpired ? 0 : entry.count,
            maxRequests: finalConfig.maxRequests,
            remaining: isExpired ? finalConfig.maxRequests : Math.max(0, finalConfig.maxRequests - entry.count),
            windowMs: finalConfig.windowMs,
            windowAge,
            blocked: isBlocked,
            unblockTime: isBlocked ? unblockTime : undefined,
        }
    }

    /**
     * Reset rate limit for a user (admin function)
     */
    reset(contextId: string): void {
        this.limits.delete(contextId)
        this.blocked.delete(contextId)
        loggers.middleware.info({ contextId }, 'Rate limit reset for user')
    }

    /**
     * Unblock a user (admin function)
     */
    unblock(contextId: string): void {
        this.blocked.delete(contextId)
        loggers.middleware.info({ contextId }, 'User unblocked')
    }

    /**
     * Get all blocked users
     */
    getBlockedUsers(): string[] {
        const now = Date.now()
        const blocked: string[] = []

        for (const [contextId, unblockTime] of this.blocked.entries()) {
            if (now < unblockTime) {
                blocked.push(contextId)
            } else {
                // Clean up expired blocks
                this.blocked.delete(contextId)
            }
        }

        return blocked
    }

    /**
     * Clear all rate limit data (use with caution)
     */
    clearAll(): void {
        this.limits.clear()
        this.blocked.clear()
        loggers.middleware.info('All rate limits cleared')
    }

    /**
     * Clean up old entries (call periodically)
     */
    cleanup(maxAgeMs: number = 10 * 60 * 1000): void {
        const now = Date.now()
        let cleaned = 0

        for (const [contextId, entry] of this.limits.entries()) {
            if (now - entry.lastRequest > maxAgeMs) {
                this.limits.delete(contextId)
                cleaned++
            }
        }

        // Clean up expired blocks
        for (const [contextId, unblockTime] of this.blocked.entries()) {
            if (now >= unblockTime) {
                this.blocked.delete(contextId)
                cleaned++
            }
        }

        if (cleaned > 0) {
            loggers.middleware.debug({ cleaned }, 'Rate limiter cleanup completed')
        }
    }
}

// Export singleton instance
export const rateLimiter = new RateLimiterManager()

// Run cleanup every 5 minutes
setInterval(() => {
    rateLimiter.cleanup()
}, 5 * 60 * 1000)
