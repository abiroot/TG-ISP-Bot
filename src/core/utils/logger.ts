/**
 * Structured Logger using Pino
 *
 * Provides production-ready logging with:
 * - Log levels (trace, debug, info, warn, error, fatal)
 * - Structured JSON output in production
 * - Pretty-printed output in development
 * - Contextual logging with correlation IDs
 */

import pino from 'pino'
import { env } from '~/config/env'

// Determine if we're in production
const isProduction = env.NODE_ENV === 'production'

// Create base logger
export const logger = pino({
    level: isProduction ? 'info' : 'debug',
    formatters: {
        level: (label) => {
            return { level: label }
        },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Pretty print in development
    transport: isProduction
        ? undefined
        : {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss',
                  ignore: 'pid,hostname',
                  singleLine: false,
              },
          },
})

/**
 * Create a child logger with context
 */
export const createContextLogger = (context: Record<string, any>) => {
    return logger.child(context)
}

/**
 * Logger for specific modules
 */
export const loggers = {
    app: createContextLogger({ module: 'app' }),
    database: createContextLogger({ module: 'database' }),
    flow: createContextLogger({ module: 'flow' }),
    middleware: createContextLogger({ module: 'middleware' }),
    service: createContextLogger({ module: 'service' }),
    ai: createContextLogger({ module: 'ai' }),
    telegram: createContextLogger({ module: 'telegram' }),
}

/**
 * Create logger for a specific flow (memoized)
 */
const flowLoggerCache = new Map<string, pino.Logger>()

export const createFlowLogger = (flowName: string) => {
    // Return cached logger if it exists
    if (flowLoggerCache.has(flowName)) {
        return flowLoggerCache.get(flowName)!
    }

    // Create new logger and cache it
    const flowLogger = createContextLogger({ module: 'flow', flow: flowName })
    flowLoggerCache.set(flowName, flowLogger)
    return flowLogger
}

/**
 * Create logger with correlation ID for request tracking
 */
export const createRequestLogger = (contextId: string) => {
    return createContextLogger({ contextId })
}

/**
 * Log performance metrics
 */
export const logPerformance = (operation: string, durationMs: number, metadata?: Record<string, any>) => {
    logger.info({
        type: 'performance',
        operation,
        durationMs,
        ...metadata,
    })
}

/**
 * Log AI API usage
 */
export const logAIUsage = (model: string, tokensUsed: number, cost?: number) => {
    logger.info({
        type: 'ai_usage',
        model,
        tokensUsed,
        cost,
    })
}

/**
 * Log message statistics
 */
export const logMessageStats = (stats: {
    contextId: string
    messageType: 'incoming' | 'outgoing'
    mediaType?: string
    success: boolean
    error?: string
}) => {
    logger.info({
        type: 'message_stats',
        ...stats,
    })
}

// Export default logger
export default logger
