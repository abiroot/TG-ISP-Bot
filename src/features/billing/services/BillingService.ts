/**
 * Billing Service
 *
 * Handles cookie-based authentication and task creation for billing system.
 * Uses session cookies for authentication instead of JWT tokens.
 *
 * Features:
 * - Cookie-based session management
 * - Automatic re-authentication on cookie expiry
 * - Task creation with form data submission
 */

import { env } from '~/config/env'
import { createFlowLogger } from '~/core/utils/logger'
import { ServiceError } from '~/core/errors/ServiceError'

const billingLogger = createFlowLogger('billing-service')

/**
 * Billing Service Error with structured error codes
 */
export class BillingServiceError extends ServiceError {
    constructor(message: string, code: string, cause?: unknown, retryable: boolean = false) {
        super('BillingService', message, code, cause, retryable)
    }
}

/**
 * Task Type for billing system
 */
export type TaskType = 'maintenance' | 'uninstall'

/**
 * Task Creation Data
 */
export interface CreateTaskData {
    type: TaskType
    message: string
    customer_username: string
    worker_ids: number[]
    send_whatsapp: 0 | 1
}

/**
 * Task Creation Response
 */
export interface CreateTaskResponse {
    success: boolean
    taskId?: string
    message?: string
}

/**
 * Billing Service Configuration
 */
export interface BillingServiceConfig {
    baseUrl: string
    username: string
    password: string
    enabled: boolean
}

/**
 * Cookie Storage
 */
interface CookieData {
    cookies: string[]
    expiry: Date
}

/**
 * Billing Service
 *
 * Manages cookie-based authentication and task operations.
 */
export class BillingService {
    private config: BillingServiceConfig
    private cookieData?: CookieData

    // Session cookie typically expires in 24 hours, but we'll refresh every 12 hours to be safe
    private readonly SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000 // 12 hours

    constructor(config?: Partial<BillingServiceConfig>) {
        this.config = {
            baseUrl: config?.baseUrl || env.BILLING_API_BASE_URL,
            username: config?.username || env.BILLING_USERNAME,
            password: config?.password || env.BILLING_PASSWORD,
            enabled: config?.enabled ?? env.BILLING_ENABLED,
        }

        billingLogger.info(
            {
                baseUrl: this.config.baseUrl,
                username: this.config.username,
                enabled: this.config.enabled,
            },
            'BillingService initialized'
        )
    }

    /**
     * Check if service is enabled
     */
    isEnabled(): boolean {
        return this.config.enabled
    }

    /**
     * Authenticate and get session cookies
     *
     * @returns Array of cookies from Set-Cookie headers
     * @throws {BillingServiceError} If authentication fails
     */
    async authenticate(): Promise<string[]> {
        // Check if we have valid cookies
        if (this.cookieData && this.cookieData.expiry > new Date()) {
            return this.cookieData.cookies
        }

        try {
            // STEP 1: GET /index.php to establish initial session
            const getResponse = await fetch(`${this.config.baseUrl}/index.php`, {
                method: 'GET',
                headers: {
                    Accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                },
            })

            // Extract initial session cookie
            const initialCookies = getResponse.headers.getSetCookie?.() || []
            if (initialCookies.length === 0) {
                throw new BillingServiceError(
                    'No initial session cookie received',
                    'AUTH_NO_INITIAL_COOKIE',
                    undefined,
                    false
                )
            }

            const initialSessionCookie = initialCookies[0].split(';')[0].trim()

            // STEP 2: POST /index.php with session cookie + credentials
            const formData = new URLSearchParams({
                username: this.config.username,
                password: this.config.password,
            })

            const response = await fetch(`${this.config.baseUrl}/index.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    Cookie: initialSessionCookie,
                    Origin: this.config.baseUrl,
                    Referer: `${this.config.baseUrl}/index.php`,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                },
                body: formData.toString(),
            })

            if (!response.ok) {
                throw new BillingServiceError(
                    `Authentication failed with status ${response.status}`,
                    'AUTH_HTTP_ERROR',
                    undefined,
                    true
                )
            }

            // Extract cookies from POST response (or reuse initial cookie if none returned)
            const setCookieHeaders = response.headers.getSetCookie?.() || []
            const finalCookie =
                setCookieHeaders.length > 0
                    ? setCookieHeaders[0].split(';')[0].trim()
                    : initialSessionCookie

            const cookies = [finalCookie]

            // Store cookies with expiry
            this.cookieData = {
                cookies,
                expiry: new Date(Date.now() + this.SESSION_LIFETIME_MS),
            }

            billingLogger.info('Billing authentication successful')

            return cookies
        } catch (error) {
            if (error instanceof BillingServiceError) {
                throw error
            }

            throw new BillingServiceError(
                'Authentication request failed',
                'AUTH_REQUEST_FAILED',
                error,
                true
            )
        }
    }

    /**
     * Create a task in the billing system
     *
     * @param taskData - Task creation data
     * @returns Task creation response
     * @throws {BillingServiceError} If task creation fails
     */
    async createTask(taskData: CreateTaskData): Promise<CreateTaskResponse> {
        if (!this.config.enabled) {
            throw new BillingServiceError(
                'Billing service is disabled',
                'SERVICE_DISABLED',
                undefined,
                false
            )
        }

        // Ensure we have valid cookies
        const cookies = await this.authenticate()
        const cookieHeader = cookies.join('; ')

        try {
            // Prepare form data
            const formData = new URLSearchParams({
                type: taskData.type,
                message: taskData.message,
                customer_username: taskData.customer_username,
            })

            // Add worker IDs as array
            taskData.worker_ids.forEach((workerId) => {
                formData.append('worker_ids[]', workerId.toString())
            })

            // Add send_whatsapp flag
            formData.append('send_whatsapp', taskData.send_whatsapp.toString())

            const response = await fetch(`${this.config.baseUrl}/create_task.php`, {
                method: 'POST',
                headers: {
                    Accept:
                        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Cookie: cookieHeader,
                    Origin: this.config.baseUrl,
                    Pragma: 'no-cache',
                    Referer: `${this.config.baseUrl}/create_task.php?`,
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'same-origin',
                    'Upgrade-Insecure-Requests': '1',
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
                    'sec-ch-ua': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                },
                body: formData.toString(),
            })

            if (!response.ok) {
                // If unauthorized, clear cookies and retry once
                if (response.status === 401 || response.status === 403) {
                    this.cookieData = undefined
                    return this.createTask(taskData)
                }

                throw new BillingServiceError(
                    `Task creation failed with status ${response.status}`,
                    'TASK_CREATE_HTTP_ERROR',
                    undefined,
                    true
                )
            }

            billingLogger.info(
                { customer: taskData.customer_username, type: taskData.type },
                'Billing task created'
            )

            return {
                success: true,
                message: 'Task created successfully',
            }
        } catch (error) {
            if (error instanceof BillingServiceError) {
                throw error
            }

            throw new BillingServiceError(
                'Task creation request failed',
                'TASK_CREATE_REQUEST_FAILED',
                error,
                true
            )
        }
    }

    /**
     * Clear cached cookies (force re-authentication on next request)
     */
    clearCookies(): void {
        this.cookieData = undefined
    }

    /**
     * Get current cookie status
     */
    getCookieStatus(): { hasCookies: boolean; expiresAt?: string; isValid: boolean } {
        if (!this.cookieData) {
            return { hasCookies: false, isValid: false }
        }

        const isValid = this.cookieData.expiry > new Date()

        return {
            hasCookies: true,
            expiresAt: this.cookieData.expiry.toISOString(),
            isValid,
        }
    }
}
