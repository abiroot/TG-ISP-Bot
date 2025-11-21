import 'dotenv/config'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createBot, createProvider, createFlow } from '@builderbot/bot'
import { PostgreSQLAdapter as Database } from '@builderbot/database-postgres'
import { TelegramProvider } from '@builderbot-plugins/telegram'
import { env } from '~/config/env'
import { testConnection } from '~/config/database'
import { runMigrations } from '~/database/migrations/runMigrations'
import { logger, loggers } from '~/core/utils/logger'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))
export const APP_VERSION = packageJson.version

// Import admin flows
import { whitelistManagementFlow } from '~/features/admin/flows/WhitelistManagementFlow'
import { botManagementFlow } from '~/features/admin/flows/BotManagementFlow'
import { versionFlow } from '~/features/admin/flows/VersionFlow'
import {
    setRoleFlow,
    addRoleFlow,
    removeRoleFlow,
    showRoleFlow,
    listRolesFlow,
} from '~/features/admin/flows/RoleManagementFlow'
import { userListingFlow } from '~/features/admin/flows/UserListingFlow'
import { unfulfilledLocationsFlow } from '~/features/admin/flows/UnfulfilledLocationsFlow'

// Import user flows
import { userHelpFlow } from '~/features/user/flows/UserHelpFlow'
import { wipeDataFlow } from '~/features/user/flows/WipeDataFlow'
import { getMyIdFlow } from '~/features/user/flows/GetMyIdFlow'

// Import conversation flows
import { welcomeFlow } from '~/features/conversation/flows/WelcomeFlow'

// Import ISP flows
import {
    customerSearchFlow,
    customerCancelFlow,
} from '~/features/isp/flows/CustomerActionMenuFlow'
import {
    customerTaskFlow,
    taskTypeSelectionFlow,
    taskWorkerSelectionFlow,
    taskWhatsAppToggleFlow,
    taskConfirmFlow,
    taskCancelFlow,
} from '~/features/isp/flows/TaskCreationFlow'

// Import location flows
import {
    updateCoordinatesFlow,
    locationMethodLocationFlow,
    locationUserModeFlow,
} from '~/features/location/flows/UpdateCoordinatesFlow'
import {
    locationHandlerFlow,
    locationDirectUserModeFlow,
} from '~/features/location/flows/LocationHandlerFlow'
import {
    webhookLocationRequestFlow,
    webhookLocationSkipFlow,
    webhookLocationCancelFlow,
} from '~/features/location/flows/WebhookLocationRequestFlow'

// Import menu flows
import {
    mainMenuFlow,
    menuBackFlow,
    // Admin menu flows
    adminWhitelistFlow,
    adminBotFlow,
    adminRolesFlow,
    adminUsersFlow,
    adminLocationsFlow,
    cmdWhitelistFlow,
    cmdRemoveWhitelistFlow,
    cmdListWhitelistFlow,
    cmdBotStatusFlow,
    cmdToggleMaintenanceFlow,
    confirmToggleMaintenanceFlow,
    cmdToggleAIFlow,
    cmdToggleVoiceFlow,
    cmdToggleMediaFlow,
    cmdToggleISPFlow,
    cmdListRolesFlow,
    cmdShowRoleFlow,
    cmdAddRoleFlow,
    cmdSetRoleFlow,
    cmdRemoveRoleFlow,
    // User Info submenu (kept for future use)
    userInfoMenuFlow,
    checkCustomerFlow,
    // Settings submenu
    settingsMenuFlow,
    updatePersonalityFlow,
    // Help submenu
    helpMenuFlow,
    helpStartFlow,
    helpCommandsFlow,
    helpISPFlow,
    // Privacy submenu
    privacyMenuFlow,
    viewDataFlow,
    deleteDataFlow,
} from '~/features/menu/flows'

// Import onboarding flows (simple 1-step: name only)
import {
    onboardingWelcomeFlow,
} from '~/features/onboarding/flows'

// Import test flows
import { pingFlow } from '~/examples/test'

const PORT = env.PORT


async function main() {
    loggers.app.info(`🚀 Starting ISP Support Bot v${APP_VERSION}...`)

    // Test database connection
    const dbConnected = await testConnection()
    if (!dbConnected) {
        loggers.app.fatal('Failed to connect to database. Exiting...')
        process.exit(1)
    }

    // Run database migrations
    try {
        await runMigrations()
    } catch (error) {
        loggers.app.fatal({ err: error }, 'Failed to run migrations')
        process.exit(1)
    }


    // Build flow list based on environment
    const flows = [
        // Admin flows (consolidated management)
        whitelistManagementFlow,
        botManagementFlow,
        // Role management flows (admin-only)
        setRoleFlow,
        addRoleFlow,
        removeRoleFlow,
        showRoleFlow,
        listRolesFlow,
        // User listing flow (admin-only)
        userListingFlow,
        // Unfulfilled locations flow (admin-only)
        unfulfilledLocationsFlow,
        versionFlow, // Version command (available to all users)

        // Onboarding flows (simple 3-step setup)
        // Button handlers MUST come before trigger flows
        onboardingWelcomeFlow, // Entry flow

        // Menu system (button-based navigation - admin-only)
        // IMPORTANT: Button handler flows MUST come before mainMenuFlow
        // to prevent 'menu' keyword from matching button events
        menuBackFlow,
        // Admin menu submenus
        adminWhitelistFlow,
        adminBotFlow,
        adminRolesFlow,
        adminUsersFlow,
        adminLocationsFlow,
        // Admin command buttons
        cmdWhitelistFlow,
        cmdRemoveWhitelistFlow,
        cmdListWhitelistFlow,
        cmdBotStatusFlow,
        cmdToggleMaintenanceFlow,
        confirmToggleMaintenanceFlow,
        cmdToggleAIFlow,
        cmdToggleVoiceFlow,
        cmdToggleMediaFlow,
        cmdToggleISPFlow,
        cmdListRolesFlow,
        cmdShowRoleFlow,
        cmdAddRoleFlow,
        cmdSetRoleFlow,
        cmdRemoveRoleFlow,
        // User Info submenu (kept for potential future use)
        userInfoMenuFlow,
        checkCustomerFlow,
        // Settings submenu
        settingsMenuFlow,
        updatePersonalityFlow,
        // Help submenu
        helpMenuFlow,
        helpStartFlow,
        helpCommandsFlow,
        helpISPFlow,
        // Privacy submenu
        privacyMenuFlow,
        viewDataFlow,
        deleteDataFlow,
        // Main menu LAST (after all button handlers) - ADMIN ONLY
        mainMenuFlow,

        // User flows (help, data wipe, ID retrieval)
        userHelpFlow,
        wipeDataFlow,
        getMyIdFlow,

        // Location update flows (must come before ISP flows)
        // Button handlers MUST come before trigger flow
        locationMethodLocationFlow, // Manual coordinate entry with inline capture
        locationUserModeFlow, // Username selection with inline capture (now updates immediately)
        locationDirectUserModeFlow, // Direct location sharing username capture (now updates immediately)
        webhookLocationRequestFlow, // Webhook-triggered location request
        webhookLocationSkipFlow, // Webhook skip button handler
        webhookLocationCancelFlow, // Webhook cancel handler
        locationHandlerFlow, // Direct location sharing (EVENTS.LOCATION)
        updateCoordinatesFlow, // Main entry flow

        // Customer action menu flows (Search or Create Task)
        // Button handlers for menu interaction (menu is displayed directly from WelcomeFlow)
        customerSearchFlow, // Search customer button handler
        customerCancelFlow, // Cancel button handler
        // Task creation wizard flows
        customerTaskFlow, // Task creation entry (verifies customer)
        taskTypeSelectionFlow, // Task type selection + message capture (merged flow)
        taskWorkerSelectionFlow, // Worker selection
        taskWhatsAppToggleFlow, // WhatsApp notification toggle
        taskConfirmFlow, // Confirm and create task
        taskCancelFlow, // Cancel task creation

        // Test flows (for development and testing)
        pingFlow,
    ]

    // Conditionally add example flows in development only
    if (env.NODE_ENV === 'development') {
        loggers.app.info('📚 Loading example flows (development mode)')

        // Import example flows dynamically
        const {
            buttonExampleFlow,
            inlineKeyboardDemoFlow,
            replyKeyboardDemoFlow,
            dynamicButtonDemoFlow,
            counterIncrementFlow,
            counterDecrementFlow,
            counterResetFlow,
            confirmationDemoFlow,
            confirmDeleteFlow,
            confirmDeleteYesFlow,
            confirmDeleteNoFlow,
            specialButtonsDemoFlow,
            demoBackFlow,
            optionHandlerFlow,
            actionHandlerFlow,
        } = await import('~/examples')

        flows.push(
            buttonExampleFlow,
            inlineKeyboardDemoFlow,
            replyKeyboardDemoFlow,
            dynamicButtonDemoFlow,
            counterIncrementFlow,
            counterDecrementFlow,
            counterResetFlow,
            confirmationDemoFlow,
            confirmDeleteFlow,
            confirmDeleteYesFlow,
            confirmDeleteNoFlow,
            specialButtonsDemoFlow,
            demoBackFlow,
            optionHandlerFlow,
            actionHandlerFlow
        )
    }

    // Welcome flow MUST be last (EVENTS.WELCOME catches all unmatched messages)
    flows.push(welcomeFlow)

    // Create flow adapter with all registered flows
    const adapterFlow = createFlow(flows)

    // Create provider with Telegram bot token from env
    const adapterProvider = createProvider(TelegramProvider, {
        token: env.TELEGRAM_BOT_TOKEN,
    })

    // Create database adapter
    const adapterDB = new Database({
        host: env.POSTGRES_DB_HOST,
        user: env.POSTGRES_DB_USER,
        database: env.POSTGRES_DB_NAME,
        password: env.POSTGRES_DB_PASSWORD,
        port: env.POSTGRES_DB_PORT,
    })

    // Add debug logging middleware for development only
    if (env.NODE_ENV === 'development') {
        adapterProvider.server.use((req, res, next) => {
            console.log(`\n📥 ${new Date().toISOString()} - ${req.method} ${req.url}`)
            console.log('Headers:', JSON.stringify(req.headers, null, 2))
            console.log('Body:', JSON.stringify(req.body, null, 2))
            next()
        })
    }

    // Initialize RoleService first (required by ISPService)
    const { RoleService } = await import('~/services/roleService.js')
    const roleService = new RoleService()

    // Auto-migrate roles from config to database on startup
    await roleService.autoMigrateConfigRoles()

    // Import service singletons (already initialized)
    const { coreAIService } = await import('~/features/conversation/services/CoreAIService')

    // ISPService requires RoleService - instantiate here
    const { ISPService } = await import('~/features/isp/services/ISPService.js')
    const ispService = new ISPService(roleService)

    // LocationService requires ISPService - instantiate here
    const { LocationService } = await import('~/features/location/services/LocationService.js')
    const locationService = new LocationService(ispService)
    const { userManagementService } = await import('~/features/admin/services/UserManagementService')
    const { mediaService } = await import('~/features/media/services/MediaService')
    const { auditService } = await import('~/features/audit/services/AuditService')
    const { botStateService } = await import('~/features/admin/services/BotStateService')
    const { onboardingStateService } = await import('~/features/onboarding/services/OnboardingStateService')

    // BillingService - cookie-based billing system integration
    const { BillingService } = await import('~/features/billing/index.js')
    const billingService = new BillingService()

    // TaskCreationStore - in-memory store for task creation wizard (prevents state race conditions)
    const { TaskCreationStore } = await import('~/features/isp/stores/TaskCreationStore.js')
    const taskCreationStore = new TaskCreationStore()

    // Core shared services
    const { messageService } = await import('~/core/services/messageService')
    const { telegramUserService } = await import('~/core/services/telegramUserService')

    // Create bot with queue configuration and extensions
    const botInstance = await createBot(
        {
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        },
        {
            queue: {
                timeout: 60000, // 60 seconds for async operations (AI + ISP API calls)
                concurrencyLimit: 50, // Handle 50 parallel conversations
            },
            extensions: {
                // Service singletons
                coreAIService,
                ispService,
                billingService,
                roleService, // Role-based access control
                locationService,
                userManagementService,
                mediaService,
                auditService,
                botStateService,
                onboardingStateService,
                messageService,
                telegramUserService,
                taskCreationStore, // In-memory store for task creation wizard
            },
        }
    )

    // Event-based message logging - automatically log ALL incoming messages
    adapterProvider.on('message', async (ctx) => {
        try {
            // Log incoming message
            const { MessageLogger } = await import('~/core/middleware/messageLogger')
            await MessageLogger.logIncoming(ctx)

            // Auto-capture user mapping for webhook notifications (non-blocking)
            const { captureUserMapping } = await import('~/core/middleware/userMappingMiddleware')
            captureUserMapping(ctx).catch((err) => {
                loggers.telegram.warn({ err }, 'User mapping capture failed (non-critical)')
            })
        } catch (error) {
            loggers.telegram.error({ err: error }, 'Failed to log incoming message via event')
        }
    })

    // Event-based outgoing message logging - automatically log ALL outgoing messages
    const bot = await import('@builderbot/bot')
    adapterProvider.on('send_message', async (payload) => {
        try {
            const { MessageLogger } = await import('~/core/middleware/messageLogger')
            const { answer, from } = payload as any
            await MessageLogger.logOutgoing(from, from, answer)
        } catch (error) {
            loggers.telegram.error({ err: error }, 'Failed to log outgoing message via event')
        }
    })

    // Global callback_query handler - routes button clicks to flows via event system
    // IMPORTANT: Must wait for vendor to be initialized (happens in initVendor() which is async)
    // The TelegramProvider from @builderbot-plugins/telegram initializes vendor in initVendor()
    // but doesn't emit a 'ready' event. We need to poll until vendor is available.

    const registerCallbackHandler = () => {
        if (!adapterProvider.vendor) {
            // Vendor not ready yet, try again in 500ms
            setTimeout(registerCallbackHandler, 500)
            return
        }

        loggers.telegram.info('Vendor initialized - registering global callback_query handler')

        adapterProvider.vendor.on('callback_query', async (callbackCtx) => {
            try {
                const callbackQuery = callbackCtx.callbackQuery
                if (!('data' in callbackQuery)) return

                const callbackData = callbackQuery.data
                const chatId = callbackQuery.message?.chat?.id
                const userId = callbackQuery.from.id

                loggers.telegram.info(
                    { callbackData, chatId, userId },
                    'Received callback_query event'
                )

                // Always answer callback query to remove loading state
                await callbackCtx.answerCbQuery()

                // Parse callback data (format: "prefix:data" or just "data")
                const parts = callbackData.split(':')
                const prefix = parts.length > 1 ? parts[0] : callbackData
                const data = parts.length > 1 ? parts.slice(1).join(':') : ''

                // Route callback to appropriate flow via custom event
                // This allows flows to handle button clicks via addKeyword('BUTTON_...')
                const eventName = `BUTTON_${prefix.toUpperCase()}`

                loggers.telegram.info(
                    { eventName, prefix, data, chatId },
                    'Dispatching button event to flows'
                )

                // Manually emit message event to simulate dispatch
                // We can't use bot.dispatch() outside HTTP context, so we replicate its behavior
                // The issue is that setEvent() uses dynamic encryption keys that we don't have access to
                // WORKAROUND: Emit directly to provider's message event without encryption
                // and use raw string event names in flows instead of utils.setEvent()
                adapterProvider.emit('message', {
                    from: chatId?.toString() || userId.toString(),
                    body: eventName, // Send event name as body (flows will match with raw string)
                    name: callbackQuery.from.first_name || 'User',
                    _callback_query: callbackQuery, // Original callback query for flow access
                    _button_data: data, // Parsed data after colon for convenience
                })
            } catch (error) {
                loggers.telegram.error({ err: error }, 'Failed to handle callback_query')
                // Try to answer callback query even on error
                try {
                    await callbackCtx.answerCbQuery('⚠️ An error occurred')
                } catch {
                    // Ignore secondary error
                }
            }
        })

        loggers.telegram.info('Callback query handler registered successfully')
    }

    // Start polling for vendor availability
    registerCallbackHandler()

    // Start HTTP server
    // Note: TwilioProvider doesn't have initHttpServer method, using httpServer from createBot
    botInstance.httpServer(PORT)

    // Register HTTP routes AFTER httpServer() is called
    // Health check endpoint
    adapterProvider.server.get('/health', (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
            JSON.stringify({
                status: 'ok',
                version: APP_VERSION,
                timestamp: new Date().toISOString(),
            })
        )
    })

    // Payment collection webhook endpoint
    // POST /webhook/collector_payment
    // Body: { tg_username: string, client_username: string, worker_username?: string }
    adapterProvider.server.post('/webhook/collector_payment', async (req: any, res) => {
        try {
            // BuilderBot/Polka parses body automatically
            const { worker_username, tg_username, client_username } = req.body || {}

            // Validate input
            if ((!tg_username && !worker_username) || !client_username) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(
                    JSON.stringify({
                        success: false,
                        error: 'Missing required fields: tg_username (or worker_username) and client_username',
                    })
                )
            }

            loggers.app.info(
                { tg_username, worker_username, client_username },
                'Payment collection webhook received'
            )

            // Look up worker's Telegram ID
            // Strategy: tg_username (Telegram ID) is preferred, fallback to worker_username lookup
            const { telegramUserService } = await import('~/core/services/telegramUserService')
            let workerTelegramId: string | null = null
            let lookupStrategy: string = 'none'

            // Try tg_username first (contains Telegram ID directly)
            if (tg_username) {
                workerTelegramId = await telegramUserService.validateTelegramId(tg_username)
                if (workerTelegramId) {
                    lookupStrategy = 'tg_username_direct'
                    loggers.app.debug(
                        { tg_username, workerTelegramId },
                        'Worker found via tg_username (Telegram ID)'
                    )
                }
            }

            // Fallback to worker_username lookup if tg_username failed or not provided
            if (!workerTelegramId && worker_username) {
                workerTelegramId = await telegramUserService.getTelegramIdByUsername(worker_username)
                if (workerTelegramId) {
                    lookupStrategy = 'worker_username_lookup'
                    loggers.app.debug(
                        { worker_username, workerTelegramId },
                        'Worker found via worker_username lookup (fallback)'
                    )
                }
            }

            if (!workerTelegramId) {
                loggers.app.warn(
                    { tg_username, worker_username, client_username },
                    'Worker not found in user mapping (tried both tg_username and worker_username)'
                )
                res.writeHead(404, { 'Content-Type': 'application/json' })
                return res.end(
                    JSON.stringify({
                        success: false,
                        error: 'Worker not found in database',
                        tg_username,
                        worker_username,
                        note: 'User must interact with bot at least once to be registered',
                    })
                )
            }

            // Prepare location update request message
            const message =
                `📍 <b>Location Update Required</b>\n\n` +
                `<b>Client:</b> <code>${client_username}</code>\n` +
                `<b>Payment:</b> Received ✅\n\n` +
                `Please update the customer's location.`

            // Send message to worker via Telegram with inline buttons
            await adapterProvider.vendor.telegram.sendMessage(workerTelegramId, message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📍 Update Location', callback_data: `webhook_loc_req:${client_username}` }],
                        [{ text: '⏭️ Skip for Now', callback_data: 'webhook_loc_skip' }],
                    ],
                },
            })

            // Log outgoing message
            const { MessageLogger } = await import('~/core/middleware/messageLogger')
            await MessageLogger.logOutgoing(workerTelegramId, workerTelegramId, message, undefined, {
                webhook: 'collector_payment',
                client_username,
                tg_username,
                worker_username, // Keep for backward compatibility
                lookup_strategy: lookupStrategy,
            })

            loggers.app.info(
                { tg_username, worker_username, workerTelegramId, client_username, lookupStrategy },
                'Payment notification sent successfully'
            )

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(
                JSON.stringify({
                    success: true,
                    tg_username,
                    worker_username, // Keep for backward compatibility
                    telegram_id: workerTelegramId,
                    message_sent: true,
                })
            )
        } catch (error) {
            loggers.app.error({ err: error }, 'Webhook error')
            res.writeHead(500, { 'Content-Type': 'application/json' })
            return res.end(
                JSON.stringify({
                    success: false,
                    error: 'Internal server error',
                })
            )
        }
    })

    loggers.app.info('✅ ISP Support Bot is running!')
    loggers.app.info('📱 Telegram bot configured')
    loggers.app.info({ port: PORT }, '🌐 HTTP server started')
    loggers.app.info({ url: `http://localhost:${PORT}/health` }, '🔍 Health check endpoint')
    loggers.app.info({ url: `http://localhost:${PORT}/webhook/collector_payment` }, '💰 Payment webhook endpoint')
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    loggers.app.info('Received SIGINT signal, shutting down gracefully...')

    // Close database connection
    const { closeConnection } = await import('~/config/database')
    await closeConnection()
    process.exit(0)
})

process.on('SIGTERM', async () => {
    loggers.app.info('Received SIGTERM signal, shutting down gracefully...')

    // Close database connection
    const { closeConnection } = await import('~/config/database')
    await closeConnection()
    process.exit(0)
})

// Start the application
main().catch((error) => {
    loggers.app.fatal({ err: error }, 'Fatal error during startup')
    process.exit(1)
})
