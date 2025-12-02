/**
 * Billing Service
 *
 * Handles task creation for the billing system using the task_api.php endpoint.
 * Uses simple worker ID (wid) based authentication instead of session cookies.
 *
 * Features:
 * - Direct API task creation without cookie management
 * - Worker ID based authentication
 * - Simplified form data submission
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
    wid: string // Worker ID (username)
    whatsapp: 'yes' | 'no' // Whether to send WhatsApp notification to customer
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
    enabled: boolean
}

/**
 * Billing Service
 *
 * Manages task creation operations via task_api.php endpoint.
 */
export class BillingService {
    private config: BillingServiceConfig

    constructor(config?: Partial<BillingServiceConfig>) {
        this.config = {
            baseUrl: config?.baseUrl || env.BILLING_API_BASE_URL,
            enabled: config?.enabled ?? env.BILLING_ENABLED,
        }

        billingLogger.info(
            {
                baseUrl: this.config.baseUrl,
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

        try {
            // Prepare form data
            const formData = new URLSearchParams({
                type: taskData.type,
                message: taskData.message,
                customer_username: taskData.customer_username,
                wid: taskData.wid,
                whatsapp: taskData.whatsapp,
            })

            const response = await fetch(`${this.config.baseUrl}/task_api.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            })

            if (!response.ok) {
                throw new BillingServiceError(
                    `Task creation failed with status ${response.status}`,
                    'TASK_CREATE_HTTP_ERROR',
                    undefined,
                    true
                )
            }

            billingLogger.info(
                { customer: taskData.customer_username, type: taskData.type, worker: taskData.wid, whatsapp: taskData.whatsapp },
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
}
