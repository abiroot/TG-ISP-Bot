/**
 * Mock Billing Service
 *
 * Provides realistic mock Billing API responses for testing without making real API calls
 * Implements the same interface as BillingService
 */

import type { CreateTaskData, CreateTaskResponse } from '~/features/billing/index.js'

/**
 * Mock Billing Service with realistic responses
 */
export class MockBillingService {
    // Track method calls for testing
    createTaskCalls: CreateTaskData[] = []

    /**
     * Mock create task - simulates task creation in billing system
     */
    async createTask(taskData: CreateTaskData): Promise<CreateTaskResponse> {
        // Track the call
        this.createTaskCalls.push(taskData)

        // Validate required fields (realistic validation)
        if (!taskData.type || !taskData.message || !taskData.customer_username || !taskData.wid) {
            return {
                success: false,
                message: 'Missing required fields',
            }
        }

        // Simulate successful task creation
        return {
            success: true,
            taskId: `TASK-${Date.now()}`,
            message: 'Task created successfully',
        }
    }

    /**
     * Check if service is enabled
     */
    isEnabled(): boolean {
        return true
    }

    /**
     * Reset mock state (for testing)
     */
    reset(): void {
        this.createTaskCalls = []
    }
}

/**
 * Factory function to create mock billing service
 */
export function createMockBillingService(): MockBillingService {
    return new MockBillingService()
}
