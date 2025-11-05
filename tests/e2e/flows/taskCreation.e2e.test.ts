/**
 * E2E Test: Task Creation Flow
 *
 * Tests the complete task creation wizard to verify state persistence bug fix.
 *
 * Flow:
 * 1. User types "check user acc" → Menu appears
 * 2. Click "Create Task" → Customer verification
 * 3. Select task type → Message prompt
 * 4. Type task message → Worker selection
 * 5. Select worker → WhatsApp toggle
 * 6. Toggle WhatsApp → Confirmation summary
 * 7. Confirm → Task created
 *
 * Critical: Verifies task message persists through all steps (race condition bug fix)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFlowTestHarness, type FlowTestHarness } from '../../utils/FlowTestHarness.js'
import { createMockISPService } from '../../utils/MockISPService.js'
import { createMockBillingService } from '../../utils/MockBillingService.js'
import { testPersonality } from '../../fixtures/personalities.js'
import { TaskCreationStore } from '~/features/isp/stores/TaskCreationStore.js'

// Import all task creation flows
import {
    customerTaskFlow,
    taskTypeSelectionFlow,
    taskWorkerSelectionFlow,
    taskWhatsAppToggleFlow,
    taskConfirmFlow,
    taskCancelFlow,
} from '~/features/isp/flows/TaskCreationFlow.js'

import {
    customerSearchFlow,
    customerCancelFlow,
} from '~/features/isp/flows/CustomerActionMenuFlow.js'

import { welcomeFlow } from '~/features/conversation/flows/WelcomeFlow.js'

describe('Task Creation Flow E2E', () => {
    let harness: FlowTestHarness
    let mockISPService: ReturnType<typeof createMockISPService>
    let mockBillingService: ReturnType<typeof createMockBillingService>
    let mockUserManagementService: any
    let mockBotStateService: any
    let mockRoleService: any
    let taskCreationStore: TaskCreationStore

    const ADMIN_ID = '+admin123'
    const WORKER_ID = '+worker456'
    const USER_ID = '+user789'

    beforeEach(async () => {
        // Create mock ISP service with test customer
        mockISPService = createMockISPService()

        // Add a test customer "acc"
        mockISPService.addCustomer({
            userName: 'acc',
            firstName: 'acc',
            lastName: 'jhonny',
            mobile: '76797109',
            phone: '76797109',
            address: 'Test Address',
            comment: 'Test customer',
            online: true,
            activeAccount: true,
            validAccount: true,
            accountType: 'Test Type',
        })

        // Create mock billing service
        mockBillingService = createMockBillingService()

        // Create TaskCreationStore instance (same as app.ts)
        taskCreationStore = new TaskCreationStore()

        // Create mock role service
        mockRoleService = {
            getUserRoles: vi.fn(async (userId: string) => {
                if (userId === ADMIN_ID) return ['admin']
                if (userId === WORKER_ID) return ['worker']
                return []
            }),
            isAdmin: vi.fn((userId: string) => userId === ADMIN_ID),
            hasRole: vi.fn((userId: string, role: string) => {
                if (userId === ADMIN_ID && role === 'admin') return true
                if (userId === WORKER_ID && role === 'worker') return true
                return false
            }),
        }

        // Create mock user management service
        mockUserManagementService = {
            getPersonality: vi.fn(async () => testPersonality),
            isWhitelisted: vi.fn(async () => true),
            isAdmin: vi.fn((userId: string) => userId === ADMIN_ID),
        }

        // Mock bot state service
        mockBotStateService = {
            isMaintenanceMode: vi.fn(async () => false),
            isFeatureEnabled: vi.fn(async () => true),
        }

        // Create test harness with all flows
        const allFlows = [
            // Customer action menu
            customerSearchFlow,
            customerCancelFlow,
            // Task creation wizard
            customerTaskFlow,
            taskTypeSelectionFlow,
            taskWorkerSelectionFlow,
            taskWhatsAppToggleFlow,
            taskConfirmFlow,
            taskCancelFlow,
            // Welcome flow (must be last)
            welcomeFlow,
        ]

        harness = createFlowTestHarness(
            allFlows,
            {
                ispService: mockISPService,
                billingService: mockBillingService,
                roleService: mockRoleService,
                userManagementService: mockUserManagementService,
                botStateService: mockBotStateService,
                taskCreationStore, // Inject our test store
            },
            false // Debug mode off
        )
    })

    afterEach(() => {
        harness.reset()
        taskCreationStore.clearAll()
        vi.clearAllMocks()
    })

    describe('Complete Task Creation Wizard', () => {
        it('should create task successfully with message persistence', async () => {
            // Step 1: Admin types "check user acc" - should show customer action menu
            const step1 = await harness.sendMessage(ADMIN_ID, 'check user acc')

            console.log('Step 1 - Initial message:', step1.lastMessage?.text)

            // Should show menu with Search/Create Task buttons
            expect(step1.lastMessage?.text).toContain('acc')
            expect(step1.lastMessage?.text).toContain('What would you like to do')
            expect(step1.lastMessage?.buttons).toBeDefined()
            expect(step1.lastMessage?.buttons?.length).toBeGreaterThan(0)

            // Step 2: Click "Create Task" button (customer_task:acc)
            const step2 = await harness.clickButton(ADMIN_ID, 'customer_task:acc')

            console.log('Step 2 - After Create Task click:', step2.lastMessage?.text)

            // Should verify customer and show task type selection
            expect(step2.lastMessage?.text).toContain('Customer Found')
            expect(step2.lastMessage?.text).toContain('acc')
            expect(step2.lastMessage?.text).toContain('Select Task Type')
            expect(step2.lastMessage?.buttons).toBeDefined()

            // Verify TaskCreationStore has customer data
            const storeAfterStep2 = taskCreationStore.get(ADMIN_ID)
            console.log('Store after step 2:', storeAfterStep2)
            expect(storeAfterStep2).toBeDefined()
            expect(storeAfterStep2?.customerUsername).toBe('acc')
            expect(storeAfterStep2?.customerName).toBe('acc jhonny')
            expect(storeAfterStep2?.customerPhone).toBe('76797109')

            // Step 3: Click "Uninstall" task type
            const step3 = await harness.clickButton(ADMIN_ID, 'task_type:uninstall')

            console.log('Step 3 - After task type click:', step3.lastMessage?.text)

            // Should ask for task description
            expect(step3.lastMessage?.text).toContain('Uninstall')
            expect(step3.lastMessage?.text).toContain('describe what needs to be done')

            // Verify TaskCreationStore has task type
            const storeAfterStep3 = taskCreationStore.get(ADMIN_ID)
            console.log('Store after step 3:', storeAfterStep3)
            expect(storeAfterStep3?.taskType).toBe('uninstall')

            // Step 4: Type task message (THIS IS THE CRITICAL STEP - tests race condition fix)
            const taskMessage = 'Install new fiber connection at customer location'
            const step4 = await harness.sendMessage(ADMIN_ID, taskMessage)

            console.log('Step 4 - After message sent:', step4.lastMessage?.text)

            // Should show worker selection with message preview
            expect(step4.lastMessage?.text).toContain('Task Message')
            expect(step4.lastMessage?.text).toContain(taskMessage)
            expect(step4.lastMessage?.text).toContain('Select Worker')
            expect(step4.lastMessage?.buttons).toBeDefined()

            // CRITICAL: Verify TaskCreationStore has task message (race condition bug fix)
            const storeAfterStep4 = taskCreationStore.get(ADMIN_ID)
            console.log('Store after step 4 (CRITICAL):', storeAfterStep4)
            expect(storeAfterStep4?.taskMessage).toBe(taskMessage)
            expect(storeAfterStep4?.taskMessage).not.toBeUndefined()
            expect(storeAfterStep4?.taskMessage).not.toBe('')

            // Step 5: Select worker (wtest - ID 13)
            const step5 = await harness.clickButton(ADMIN_ID, 'select_worker:13')

            console.log('Step 5 - After worker selection:', step5.lastMessage?.text)

            // Should show WhatsApp toggle
            expect(step5.lastMessage?.text).toContain('Worker Selected')
            expect(step5.lastMessage?.text).toContain('wtest')
            expect(step5.lastMessage?.text).toContain('Send WhatsApp Notification')

            // Verify TaskCreationStore has worker info
            const storeAfterStep5 = taskCreationStore.get(ADMIN_ID)
            console.log('Store after step 5:', storeAfterStep5)
            expect(storeAfterStep5?.selectedWorkerId).toBe(13)
            expect(storeAfterStep5?.selectedWorkerName).toBe('wtest')
            expect(storeAfterStep5?.workerIds).toEqual([13])
            // CRITICAL: Task message should STILL be there
            expect(storeAfterStep5?.taskMessage).toBe(taskMessage)

            // Step 6: Toggle WhatsApp to Yes (1)
            const step6 = await harness.clickButton(ADMIN_ID, 'whatsapp:1')

            console.log('Step 6 - After WhatsApp toggle:', step6.lastMessage?.text)

            // Should show task summary with ALL data
            expect(step6.lastMessage?.text).toContain('Task Summary')
            expect(step6.lastMessage?.text).toContain('Customer')
            expect(step6.lastMessage?.text).toContain('acc')
            expect(step6.lastMessage?.text).toContain('Installation')
            // CRITICAL: Task message MUST appear in summary
            expect(step6.lastMessage?.text).toContain(taskMessage)
            expect(step6.lastMessage?.text).not.toContain('No description')
            expect(step6.lastMessage?.text).toContain('wtest')
            expect(step6.lastMessage?.text).toContain('WhatsApp')
            expect(step6.lastMessage?.text).toContain('Yes')

            // Verify TaskCreationStore has WhatsApp preference
            const storeAfterStep6 = taskCreationStore.get(ADMIN_ID)
            console.log('Store after step 6 (FINAL CHECK):', storeAfterStep6)
            expect(storeAfterStep6?.sendWhatsApp).toBe(1)
            // CRITICAL: All data should be present
            expect(storeAfterStep6?.customerUsername).toBe('acc')
            expect(storeAfterStep6?.taskType).toBe('installation')
            expect(storeAfterStep6?.taskMessage).toBe(taskMessage)
            expect(storeAfterStep6?.workerIds).toEqual([13])
            expect(storeAfterStep6?.sendWhatsApp).toBe(1)

            // Validate data completeness
            const validation = taskCreationStore.validateComplete(ADMIN_ID)
            console.log('Validation result:', validation)
            expect(validation.valid).toBe(true)
            expect(validation.missingFields).toHaveLength(0)

            // Step 7: Confirm task creation
            const step7 = await harness.clickButton(ADMIN_ID, 'task_confirm')

            console.log('Step 7 - After confirmation:', step7.lastMessage?.text)

            // Should show success message
            expect(step7.lastMessage?.text).toContain('Task Created Successfully')
            expect(step7.lastMessage?.text).toContain('acc')
            expect(step7.lastMessage?.text).toContain('installation')

            // Verify billing service was called with correct data
            expect(mockBillingService.createTaskCalls).toHaveLength(1)
            const taskCall = mockBillingService.createTaskCalls[0]
            expect(taskCall.type).toBe('installation')
            expect(taskCall.message).toBe(taskMessage) // CRITICAL: Message must match
            expect(taskCall.customer_username).toBe('acc')
            expect(taskCall.worker_ids).toEqual([13])
            expect(taskCall.send_whatsapp).toBe(1)

            // Verify store was cleaned up
            const storeAfterCompletion = taskCreationStore.get(ADMIN_ID)
            expect(storeAfterCompletion).toBeUndefined()
        })

        it('should handle task cancellation and clean up store', async () => {
            // Start task creation
            await harness.sendMessage(ADMIN_ID, 'check user acc')
            await harness.clickButton(ADMIN_ID, 'customer_task:acc')
            await harness.clickButton(ADMIN_ID, 'task_type:maintenance')

            // Verify store has data
            const storeBeforeCancel = taskCreationStore.get(ADMIN_ID)
            expect(storeBeforeCancel).toBeDefined()
            expect(storeBeforeCancel?.taskType).toBe('maintenance')

            // Cancel
            const cancelResponse = await harness.clickButton(ADMIN_ID, 'task_cancel')

            expect(cancelResponse.lastMessage?.text).toContain('Task Creation Cancelled')

            // Verify store was cleaned up
            const storeAfterCancel = taskCreationStore.get(ADMIN_ID)
            expect(storeAfterCancel).toBeUndefined()

            // Verify billing service was NOT called
            expect(mockBillingService.createTaskCalls).toHaveLength(0)
        })

        it('should prevent non-admin/worker from creating tasks', async () => {
            // Regular user tries to access task creation
            const response = await harness.sendMessage(USER_ID, 'check user acc')

            // Should NOT show customer action menu
            expect(response.lastMessage?.text).not.toContain('What would you like to do')

            // Should handle gracefully (either AI response or no menu)
            expect(response.lastMessage).toBeDefined()
        })
    })

    describe('Data Persistence Tests (Race Condition)', () => {
        it('should preserve task message when clicking through quickly', async () => {
            // Simulate rapid clicking (the original bug scenario)
            await harness.sendMessage(ADMIN_ID, 'check user acc')
            await harness.clickButton(ADMIN_ID, 'customer_task:acc')
            await harness.clickButton(ADMIN_ID, 'task_type:support')

            const taskMessage = 'Urgent: Customer internet down'
            await harness.sendMessage(ADMIN_ID, taskMessage)

            // Click worker IMMEDIATELY (no delay - tests race condition)
            await harness.clickButton(ADMIN_ID, 'select_worker:15')

            // CRITICAL: Verify task message is still in store
            const storeAfterFastClick = taskCreationStore.get(ADMIN_ID)
            expect(storeAfterFastClick?.taskMessage).toBe(taskMessage)
            expect(storeAfterFastClick?.taskMessage).not.toBeUndefined()

            // Continue to confirmation
            await harness.clickButton(ADMIN_ID, 'whatsapp:0')

            const confirmationStep = await harness.getLastMessage(ADMIN_ID)

            // CRITICAL: Summary must show task message (not "No description")
            expect(confirmationStep?.text).toContain(taskMessage)
            expect(confirmationStep?.text).not.toContain('No description')
        })

        it('should handle empty message validation', async () => {
            await harness.sendMessage(ADMIN_ID, 'check user acc')
            await harness.clickButton(ADMIN_ID, 'customer_task:acc')
            await harness.clickButton(ADMIN_ID, 'task_type:upgrade')

            // Send empty message
            const emptyResponse = await harness.sendMessage(ADMIN_ID, '   ')

            // Should show error
            expect(emptyResponse.lastMessage?.text).toContain('Message cannot be empty')

            // Send valid message
            const validResponse = await harness.sendMessage(ADMIN_ID, 'Valid task message')

            // Should show worker selection
            expect(validResponse.lastMessage?.text).toContain('Select Worker')

            // Verify store has message
            const store = taskCreationStore.get(ADMIN_ID)
            expect(store?.taskMessage).toBe('Valid task message')
        })
    })
})
