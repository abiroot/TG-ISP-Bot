/**
 * Base Service Error Class
 *
 * Provides a standardized error structure for all services.
 * Eliminates duplicate error class definitions across the codebase.
 *
 * Usage:
 * ```typescript
 * import { ServiceError } from '~/core/errors/ServiceError'
 *
 * // In your service
 * export class MyServiceError extends ServiceError {
 *     constructor(message: string, code: string, cause?: unknown, retryable: boolean = false) {
 *         super('MyService', message, code, cause, retryable)
 *     }
 * }
 *
 * // Throw errors
 * throw new MyServiceError('Something went wrong', 'MY_SERVICE_ERROR', error, true)
 * ```
 */

/**
 * Base ServiceError class with structured error information
 */
export class ServiceError extends Error {
    /**
     * Create a new ServiceError
     *
     * @param serviceName - Name of the service (e.g., 'ISP', 'CoreAI', 'Media')
     * @param message - Human-readable error message
     * @param code - Machine-readable error code (e.g., 'API_ERROR', 'VALIDATION_ERROR')
     * @param cause - Original error that caused this error (for error chaining)
     * @param retryable - Whether this error can be retried
     */
    constructor(
        public readonly serviceName: string,
        message: string,
        public readonly code: string,
        public readonly cause?: unknown,
        public readonly retryable: boolean = false
    ) {
        super(message)
        this.name = `${serviceName}Error`

        // Maintains proper stack trace for where error was thrown (V8 only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    /**
     * Create a retryable error
     */
    static retryable(
        serviceName: string,
        message: string,
        code: string,
        cause?: unknown
    ): ServiceError {
        return new ServiceError(serviceName, message, code, cause, true)
    }

    /**
     * Create a non-retryable error
     */
    static fatal(
        serviceName: string,
        message: string,
        code: string,
        cause?: unknown
    ): ServiceError {
        return new ServiceError(serviceName, message, code, cause, false)
    }

    /**
     * Format error for logging
     */
    toJSON() {
        return {
            name: this.name,
            serviceName: this.serviceName,
            message: this.message,
            code: this.code,
            retryable: this.retryable,
            cause: this.cause,
            stack: this.stack,
        }
    }
}
