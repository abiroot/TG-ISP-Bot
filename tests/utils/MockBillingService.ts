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
    authenticateCalls: number = 0
    createTaskCalls: CreateTaskData[] = []
    clearCookiesCalls: number = 0

    // Mock state
    private isAuthenticated: boolean = false
    private mockCookies: string[] = ['PHPSESSID=mock-session-id']

    /**
     * Mock authenticate - simulates cookie-based authentication
     */
    async authenticate(): Promise<string[]> {
        this.authenticateCalls++
        this.isAuthenticated = true
        return this.mockCookies
    }

    /**
     * Mock create task - simulates task creation in billing system
     */
    async createTask(taskData: CreateTaskData): Promise<CreateTaskResponse> {
        // Track the call
        this.createTaskCalls.push(taskData)

        // Auto-authenticate if needed
        if (!this.isAuthenticated) {
            await this.authenticate()
        }

        // Validate required fields (realistic validation)
        if (!taskData.type || !taskData.message || !taskData.customer_username || !taskData.worker_ids) {
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
     * Mock clear cookies
     */
    clearCookies(): void {
        this.clearCookiesCalls++
        this.isAuthenticated = false
        this.mockCookies = []
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
        this.authenticateCalls = 0
        this.createTaskCalls = []
        this.clearCookiesCalls = 0
        this.isAuthenticated = false
        this.mockCookies = ['PHPSESSID=mock-session-id']
    }
}

/**
 * Factory function to create mock billing service
 */
export function createMockBillingService(): MockBillingService {
    return new MockBillingService()
}
