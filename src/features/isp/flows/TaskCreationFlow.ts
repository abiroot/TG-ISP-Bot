/**
 * Task Creation Flow
 *
 * Multi-step wizard for creating billing tasks for customers.
 * Requires customer to exist in ISP system.
 *
 * Steps:
 * 1. Verify customer exists (customerTaskFlow)
 * 2. Select task type (maintenance/uninstall) (taskTypeSelectionFlow)
 * 3. Enter task message/description (taskTypeSelectionFlow - capture)
 * 4. Select worker (taskWorkerSelectionFlow)
 * 5. Choose WhatsApp notification (taskWhatsAppToggleFlow)
 * 6. Confirm and create task (taskConfirmFlow)
 *
 * Access: Admin and Worker roles only
 */

import { addKeyword } from '@builderbot/bot'
import type { TelegramProvider } from '@builderbot-plugins/telegram'
import type { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { sendWithInlineButtons } from '~/core/utils/flowHelpers'
import { createCallbackButton } from '~/core/utils/telegramButtons'
import { createFlowLogger } from '~/core/utils/logger'
import { html } from '~/core/utils/telegramFormatting'
import { LoadingIndicator } from '~/core/utils/loadingIndicator'
import type { CreateTaskData, TaskType } from '~/features/billing/index.js'

const logger = createFlowLogger('task-creation')

/**
 * Hardcoded workers from billing system
 * These worker IDs match the billing system's worker_ids
 */
const BILLING_WORKERS = [
    { id: 9, name: 'wmarwan' },
    { id: 10, name: 'walewe' },
    { id: 11, name: 'wtaktak' },
    { id: 12, name: 'wnour' },
    { id: 13, name: 'wtest' },
    { id: 15, name: 'wjhonny' },
    { id: 17, name: 'wchristelle' },
    { id: 22, name: 'hugilo' },
    { id: 23, name: 'hueddy' },
    { id: 26, name: 'collmohamadalhamad' },
] as const

/**
 * Step 1: Verify customer exists before starting task creation
 * Entry point from customer action menu
 * Button format: customer_task:{identifier}
 */
export const customerTaskFlow = addKeyword<TelegramProvider, Database>('BUTTON_CUSTOMER_TASK')
    .addAction(async (ctx, { state, extensions, provider, endFlow }) => {
        const { ispService, taskCreationStore } = extensions!
        const userId = String(ctx.from) // Normalize to string for consistent store keys
        const identifier = ctx._button_data as string

        if (!identifier) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>No customer identifier found.</b>',
                { parse_mode: 'HTML' }
            )
            return endFlow()
        }

        logger.info({ from: ctx.from, identifier }, 'Task creation initiated - verifying customer')

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '🔍 Verifying customer...')

        try {
            // Verify customer exists
            const users = await ispService.searchCustomer(identifier)

            await LoadingIndicator.hide(provider, loadingMsg)

            if (!users || users.length === 0) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Customer Not Found</b>\n\n' +
                        `Cannot create task: Customer <code>${html.escape(identifier)}</code> does not exist in the system.\n\n` +
                        `<i>Please verify the customer information and try again.</i>`,
                    { parse_mode: 'HTML' }
                )
                await state.clear()
                taskCreationStore.clear(userId)
                return endFlow()
            }

            // Customer found - store customer data in taskCreationStore
            const customer = users[0] // Use first match
            const customerData = {
                customerUsername: customer.userName,
                customerName: `${customer.firstName} ${customer.lastName}`.trim(),
                customerPhone: customer.mobile || customer.phone,
            }

            taskCreationStore.set(userId, customerData)

            // DEBUG: Log what was stored
            const storedData = taskCreationStore.get(userId)
            logger.info(
                {
                    from: ctx.from,
                    stored: customerData,
                    retrieved: storedData,
                    storeSize: taskCreationStore.size()
                },
                '🔍 DEBUG: Customer data stored in taskCreationStore'
            )

            logger.info(
                { from: ctx.from, customerUsername: customer.userName },
                'Customer verified - showing task type selection'
            )

            // Show task type selection
            await sendWithInlineButtons(
                ctx,
                { provider, state } as any,
                `✅ <b>Customer Found</b>\n\n` +
                    `<b>Name:</b> ${html.escape(customer.firstName)} ${html.escape(customer.lastName)}\n` +
                    `<b>Username:</b> <code>${html.escape(customer.userName)}</code>\n` +
                    `<b>Phone:</b> <code>${html.escape(customer.mobile || customer.phone)}</code>\n\n` +
                    `<b>Select Task Type:</b>`,
                [
                    [createCallbackButton('🔧 Maintenance', 'task_type:maintenance')],
                    [createCallbackButton('🛠️ Uninstall', 'task_type:uninstall')],
                    [createCallbackButton('❌ Cancel', 'task_cancel')],
                ],
                { parseMode: 'HTML' }
            )
        } catch (error) {
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error({ err: error, from: ctx.from, identifier }, 'Customer verification failed')

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Verification failed</b>\n\n' +
                    'An error occurred while verifying the customer. Please try again.',
                { parse_mode: 'HTML' }
            )
            await state.clear()
            taskCreationStore.clear(userId)
            return endFlow()
        }
    })

/**
 * Step 2: Handle task type selection and capture message
 * Merged flow: Handles button click → prompts for message → captures text input
 */
export const taskTypeSelectionFlow = addKeyword<TelegramProvider, Database>('BUTTON_TASK_TYPE')
    .addAction(async (ctx, { state, provider, extensions }) => {
        const { taskCreationStore } = extensions!
        const userId = String(ctx.from) // Normalize to string for consistent store keys
        const taskType = ctx._button_data as TaskType

        if (!['maintenance', 'uninstall'].includes(taskType)) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Invalid task type.</b>',
                { parse_mode: 'HTML' }
            )
            return
        }

        // Store task type in taskCreationStore
        taskCreationStore.set(userId, { taskType })

        // DEBUG: Log what was stored
        const storedData = taskCreationStore.get(userId)
        logger.info(
            {
                from: ctx.from,
                taskType,
                storeAfterSet: storedData,
                storeSize: taskCreationStore.size()
            },
            '🔍 DEBUG: Task type stored in taskCreationStore'
        )

        const taskTypeLabels: Record<TaskType, string> = {
            maintenance: '🔧 Maintenance',
            uninstall: '🛠️ Uninstall'
        }

        logger.info({ from: ctx.from, taskType }, 'Task type selected')

        // Ask for message with DIRECT provider.vendor call (parse_mode works)
        await provider.vendor.telegram.sendMessage(
            ctx.from,
            `${taskTypeLabels[taskType]} <b>selected.</b>\n\n` +
                `Please describe what needs to be done:\n\n` +
                `<i>Type your message and send it.</i>`,
            { parse_mode: 'HTML' }
        )
    })
    .addAnswer(
        '', // Empty answer, we already prompted in .addAction() above
        { capture: true },
        async (ctx, { state, extensions, provider }) => {
            const { taskCreationStore } = extensions!
            const message = ctx.body

            if (!message || message.trim().length === 0) {
                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '❌ <b>Message cannot be empty.</b>\n\n' +
                        'Please describe the task:',
                    { parse_mode: 'HTML' }
                )
                return
            }

            // Store message in taskCreationStore
            const taskMessage = message.trim()
            const userId = String(ctx.from) // CRITICAL: Normalize to string
            taskCreationStore.set(userId, { taskMessage })

            // DEBUG: Log what was stored (CRITICAL - this is where bug was happening)
            const storedData = taskCreationStore.get(userId)
            logger.info(
                {
                    from: ctx.from,
                    messageLength: message.length,
                    taskMessage,
                    storeAfterSet: storedData,
                    hasTaskMessage: !!storedData?.taskMessage,
                    taskMessageValue: storedData?.taskMessage,
                    storeSize: taskCreationStore.size()
                },
                '🔍 DEBUG: Task message stored in taskCreationStore (CRITICAL STEP)'
            )

            logger.info({ from: ctx.from, messageLength: message.length }, 'Task message captured')

            // Create worker selection buttons from hardcoded list
            const workerButtons = BILLING_WORKERS.map((worker) => [
                createCallbackButton(`👤 ${worker.name}`, `select_worker:${worker.id}`),
            ])

            // Add cancel button
            workerButtons.push([createCallbackButton('❌ Cancel', 'task_cancel')])

            await sendWithInlineButtons(
                ctx,
                { provider, state } as any,
                `<b>📋 Task Message:</b>\n<i>${html.escape(message)}</i>\n\n` +
                    `<b>Select Worker:</b>\n` +
                    `<i>Choose who should handle this task</i>`,
                workerButtons,
                { parseMode: 'HTML' }
            )
        }
    )

/**
 * Step 4: Handle worker selection
 */
export const taskWorkerSelectionFlow = addKeyword<TelegramProvider, Database>('BUTTON_SELECT_WORKER')
    .addAction(async (ctx, { state, provider, extensions }) => {
        const { taskCreationStore } = extensions!
        const userId = String(ctx.from) // Normalize to string for consistent store keys
        const workerId = parseInt(ctx._button_data as string, 10)

        if (!workerId || isNaN(workerId)) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Invalid worker selection.</b>',
                { parse_mode: 'HTML' }
            )
            return
        }

        // Find worker from hardcoded list (no state dependency)
        const selectedWorker = BILLING_WORKERS.find((w) => w.id === workerId)

        if (!selectedWorker) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Worker not found.</b>',
                { parse_mode: 'HTML' }
            )
            return
        }

        // Store worker info in taskCreationStore
        const workerData = {
            selectedWorkerId: workerId,
            selectedWorkerName: selectedWorker.name,
            wid: selectedWorker.name, // Worker username for new API
        }

        taskCreationStore.set(userId, workerData)

        // DEBUG: Log what was stored
        const storedData = taskCreationStore.get(userId)
        logger.info(
            {
                from: ctx.from,
                workerId,
                workerName: selectedWorker.name,
                stored: workerData,
                storeAfterSet: storedData,
                hasTaskMessage: !!storedData?.taskMessage,
                taskMessageValue: storedData?.taskMessage,
                storeSize: taskCreationStore.size()
            },
            '🔍 DEBUG: Worker data stored in taskCreationStore (check if taskMessage still exists)'
        )

        logger.info(
            { from: ctx.from, workerId, workerName: selectedWorker.name },
            'Worker selected'
        )

        // Get all task data from taskCreationStore for confirmation
        const customerUsername = storedData?.customerUsername
        const customerName = storedData?.customerName
        const taskType = storedData?.taskType
        const taskMessage = storedData?.taskMessage

        const taskTypeLabels: Record<TaskType, string> = {
            maintenance: '🔧 Maintenance',
            uninstall: '🛠️ Uninstall',
        }

        // Show WhatsApp notification selection
        await sendWithInlineButtons(
            ctx,
            { provider, state } as any,
            `<b>📋 Task Details</b>\n\n` +
                `<b>Customer:</b> ${html.escape(customerName || customerUsername || 'Unknown')}\n` +
                `<b>Username:</b> <code>${html.escape(customerUsername || 'Unknown')}</code>\n\n` +
                `<b>Task Type:</b> ${taskTypeLabels[taskType!]}\n` +
                `<b>Description:</b>\n<i>${html.escape(taskMessage || 'No description')}</i>\n\n` +
                `<b>Assigned To:</b> ${html.escape(selectedWorker.name)}\n\n` +
                `<b>Send WhatsApp notification to customer?</b>`,
            [
                [createCallbackButton('✅ Yes, send WhatsApp', 'task_whatsapp:yes')],
                [createCallbackButton('❌ No WhatsApp', 'task_whatsapp:no')],
                [createCallbackButton('🚫 Cancel', 'task_cancel')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Step 5: Handle WhatsApp notification toggle
 */
export const taskWhatsAppToggleFlow = addKeyword<TelegramProvider, Database>('BUTTON_TASK_WHATSAPP')
    .addAction(async (ctx, { state, provider, extensions }) => {
        const { taskCreationStore } = extensions!
        const userId = String(ctx.from)
        const whatsappChoice = ctx._button_data as 'yes' | 'no'

        if (!['yes', 'no'].includes(whatsappChoice)) {
            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Invalid selection.</b>',
                { parse_mode: 'HTML' }
            )
            return
        }

        // Store WhatsApp preference
        taskCreationStore.set(userId, { sendWhatsApp: whatsappChoice === 'yes' ? 1 : 0 })

        const storedData = taskCreationStore.get(userId)
        logger.info(
            {
                from: ctx.from,
                whatsappChoice,
                storeAfterSet: storedData,
                storeSize: taskCreationStore.size()
            },
            '🔍 DEBUG: WhatsApp preference stored in taskCreationStore'
        )

        // Get all task data for final confirmation
        const customerUsername = storedData?.customerUsername
        const customerName = storedData?.customerName
        const taskType = storedData?.taskType
        const taskMessage = storedData?.taskMessage
        const selectedWorkerName = storedData?.selectedWorkerName

        const taskTypeLabels: Record<TaskType, string> = {
            maintenance: '🔧 Maintenance',
            uninstall: '🛠️ Uninstall',
        }

        const whatsAppStatus = whatsappChoice === 'yes' ? '✅ Yes' : '❌ No'

        logger.info({ from: ctx.from, whatsappChoice }, 'WhatsApp preference selected')

        // Show final confirmation
        await sendWithInlineButtons(
            ctx,
            { provider, state } as any,
            `<b>📋 Task Summary</b>\n\n` +
                `<b>Customer:</b> ${html.escape(customerName || customerUsername || 'Unknown')}\n` +
                `<b>Username:</b> <code>${html.escape(customerUsername || 'Unknown')}</code>\n\n` +
                `<b>Task Type:</b> ${taskTypeLabels[taskType!]}\n` +
                `<b>Description:</b>\n<i>${html.escape(taskMessage || 'No description')}</i>\n\n` +
                `<b>Assigned To:</b> ${html.escape(selectedWorkerName || 'Unknown')}\n` +
                `<b>WhatsApp Notification:</b> ${whatsAppStatus}\n\n` +
                `<b>Confirm to create this task?</b>`,
            [
                [createCallbackButton('✅ Confirm & Create', 'task_confirm')],
                [createCallbackButton('❌ Cancel', 'task_cancel')],
            ],
            { parseMode: 'HTML' }
        )
    })

/**
 * Step 6: Confirm and create task
 */
export const taskConfirmFlow = addKeyword<TelegramProvider, Database>('BUTTON_TASK_CONFIRM')
    .addAction(async (ctx, { state, extensions, provider, endFlow }) => {
        const { billingService, taskCreationStore } = extensions!
        const userId = String(ctx.from) // Normalize to string for consistent store keys

        // Get all task data from taskCreationStore
        const taskData = taskCreationStore.get(userId)

        // DEBUG: Log COMPLETE store data at confirmation
        logger.info(
            {
                from: ctx.from,
                completeStoreData: taskData,
                storeSize: taskCreationStore.size(),
                storeExists: !!taskData
            },
            '🔍 DEBUG: CONFIRMATION STEP - Complete store data retrieved'
        )

        const customerUsername = taskData?.customerUsername
        const taskType = taskData?.taskType
        const taskMessage = taskData?.taskMessage
        const wid = taskData?.wid
        const sendWhatsApp = taskData?.sendWhatsApp

        // DEBUG: Log validation check
        const validation = {
            hasCustomerUsername: !!customerUsername,
            hasTaskType: !!taskType,
            hasTaskMessage: !!taskMessage,
            hasWid: !!wid,
            hasSendWhatsApp: sendWhatsApp !== undefined,
            customerUsername,
            taskType,
            taskMessage,
            wid,
            sendWhatsApp
        }

        logger.info(
            {
                from: ctx.from,
                validation,
                willFail: !customerUsername || !taskType || !taskMessage || !wid || sendWhatsApp === undefined
            },
            '🔍 DEBUG: VALIDATION CHECK - Field presence'
        )

        // Validate all required fields
        if (!customerUsername || !taskType || !taskMessage || !wid || sendWhatsApp === undefined) {
            logger.error(
                {
                    from: ctx.from,
                    validation,
                    taskData
                },
                '❌ DEBUG: VALIDATION FAILED - Missing required fields'
            )

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Missing task information.</b>\n\n' +
                    'Please start over.',
                { parse_mode: 'HTML' }
            )
            await state.clear()
            taskCreationStore.clear(userId)
            return endFlow()
        }

        const whatsappValue: 'yes' | 'no' = sendWhatsApp === 1 ? 'yes' : 'no'

        logger.info(
            {
                from: ctx.from,
                customerUsername,
                taskType,
                wid,
                whatsapp: whatsappValue,
            },
            'Creating billing task'
        )

        // Show loading indicator
        const loadingMsg = await LoadingIndicator.show(provider, ctx.from, '📋 Creating task...')

        try {
            // Create task using new API format
            const createTaskData: CreateTaskData = {
                type: taskType,
                message: taskMessage,
                customer_username: customerUsername,
                wid: wid,
                whatsapp: whatsappValue,
            }

            const result = await billingService.createTask(createTaskData)

            await LoadingIndicator.hide(provider, loadingMsg)

            if (result.success) {
                const whatsAppStatusText = whatsappValue === 'yes' ? '✅ Sent' : '❌ Not sent'

                await provider.vendor.telegram.sendMessage(
                    ctx.from,
                    '✅ <b>Task Created Successfully!</b>\n\n' +
                        `<b>Customer:</b> <code>${html.escape(customerUsername)}</code>\n` +
                        `<b>Type:</b> ${taskType}\n` +
                        `<b>Worker:</b> ${html.escape(wid)}\n` +
                        `<b>WhatsApp:</b> ${whatsAppStatusText}\n\n` +
                        `<i>The task has been assigned and is now visible in the billing system.</i>`,
                    { parse_mode: 'HTML' }
                )

                logger.info(
                    {
                        from: ctx.from,
                        customerUsername,
                        taskType,
                        whatsapp: whatsappValue,
                    },
                    'Task created successfully'
                )
            } else {
                throw new Error('Task creation returned success: false')
            }
        } catch (error) {
            await LoadingIndicator.hide(provider, loadingMsg)

            logger.error(
                {
                    err: error,
                    from: ctx.from,
                    customerUsername,
                    taskType,
                },
                'Task creation failed'
            )

            await provider.vendor.telegram.sendMessage(
                ctx.from,
                '❌ <b>Task Creation Failed</b>\n\n' +
                    'An error occurred while creating the task. Please try again later.\n\n' +
                    `<i>Error: ${error instanceof Error ? html.escape(error.message) : 'Unknown error'}</i>`,
                { parse_mode: 'HTML' }
            )
        }

        // Cleanup
        await state.clear()
        taskCreationStore.clear(userId)
        return endFlow()
    })

/**
 * Handle task cancellation at any step
 */
export const taskCancelFlow = addKeyword<TelegramProvider, Database>('BUTTON_TASK_CANCEL')
    .addAction(async (ctx, { state, provider, extensions, endFlow }) => {
        const { taskCreationStore } = extensions!
        const userId = String(ctx.from) // Normalize to string for consistent store keys

        await state.clear()
        taskCreationStore.clear(userId)

        await provider.vendor.telegram.sendMessage(
            ctx.from,
            '❌ <b>Task Creation Cancelled</b>',
            { parse_mode: 'HTML' }
        )

        logger.info({ from: ctx.from }, 'Task creation cancelled')

        return endFlow()
    })
