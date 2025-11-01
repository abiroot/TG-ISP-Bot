/**
 * Retry utility for handling transient failures in flows
 */

import { createFlowLogger } from '~/core/utils/logger'

const logger = createFlowLogger('FlowRetry')

export interface RetryOptions {
  maxRetries: number
  delayMs: number
  exponentialBackoff?: boolean
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>
}

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    delayMs,
    exponentialBackoff = true,
    onRetry
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt === maxRetries - 1) {
        // Last attempt failed, throw the error
        throw error
      }

      // Calculate delay with optional exponential backoff
      const delay = exponentialBackoff
        ? delayMs * Math.pow(2, attempt)
        : delayMs

      logger.warn(
        { attempt: attempt + 1, maxRetries, delay, error },
        'Operation failed, retrying...'
      )

      // Call onRetry callback if provided
      if (onRetry) {
        await onRetry(attempt + 1, error)
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError
}

/**
 * Check if an error is retryable (transient network/API errors)
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const err = error as any

  // Network errors
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    return true
  }

  // HTTP 5xx errors (server errors)
  if (err.status >= 500 && err.status < 600) {
    return true
  }

  // HTTP 429 (rate limit) - should retry with backoff
  if (err.status === 429) {
    return true
  }

  // Custom error property
  if (err.retryable === true) {
    return true
  }

  return false
}

/**
 * Retry only if error is retryable
 */
export async function withSmartRetry<T>(
  operation: () => Promise<T>,
  options: Omit<RetryOptions, 'maxRetries'> & { maxRetries?: number }
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3

  try {
    return await withRetry(operation, { ...options, maxRetries })
  } catch (error) {
    if (!isRetryableError(error)) {
      // Non-retryable error, fail fast
      throw error
    }
    throw error
  }
}
