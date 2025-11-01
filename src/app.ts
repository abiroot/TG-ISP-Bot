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

// Import user flows
import { userHelpFlow } from '~/features/user/flows/UserHelpFlow'
import { wipeDataFlow } from '~/features/user/flows/WipeDataFlow'

// Import conversation flows
import { personalitySetupFlow } from '~/features/conversation/flows/PersonalitySetupFlow'
import { firstTimeUserFlow } from '~/features/conversation/flows/FirstTimeUserFlow'
import { welcomeFlow } from '~/features/conversation/flows/WelcomeFlow'

// Import ISP flows
import { ispQueryFlow } from '~/features/isp/flows/ISPQueryFlow'

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
        versionFlow, // Version command (available to all users)

        // User flows (help, data wipe)
        userHelpFlow,
        wipeDataFlow,

        // Conversation/Personality flows
        personalitySetupFlow,
        firstTimeUserFlow, // Automatic setup for first-time users

        // ISP Support flow (customer lookup)
        ispQueryFlow,

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

    // Import service singletons (already initialized)
    const { coreAIService } = await import('~/features/conversation/services/CoreAIService')
    const { ispService } = await import('~/features/isp/services/ISPService')
    const { userManagementService } = await import('~/features/admin/services/UserManagementService')
    const { mediaService } = await import('~/features/media/services/MediaService')
    const { auditService } = await import('~/features/audit/services/AuditService')
    const { botStateService } = await import('~/features/admin/services/BotStateService')

    // Core shared services
    const { messageService } = await import('~/core/services/messageService')

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
                userManagementService,
                mediaService,
                auditService,
                botStateService,
                messageService,
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
    // Body: { worker_username: string, client_username: string }
    adapterProvider.server.post('/webhook/collector_payment', async (req: any, res) => {
        try {
            // BuilderBot/Polka parses body automatically
            const { worker_username, client_username } = req.body || {}

            // Validate input
            if (!worker_username || !client_username) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                return res.end(
                    JSON.stringify({
                        success: false,
                        error: 'Missing required fields: worker_username and client_username',
                    })
                )
            }

            loggers.app.info(
                { worker_username, client_username },
                'Payment collection webhook received'
            )

            // Look up worker's Telegram ID
            const { telegramUserService } = await import('~/core/services/telegramUserService')
            const workerTelegramId = await telegramUserService.getTelegramIdByUsername(
                worker_username
            )

            if (!workerTelegramId) {
                loggers.app.warn({ worker_username }, 'Worker not found in user mapping')
                res.writeHead(404, { 'Content-Type': 'application/json' })
                return res.end(
                    JSON.stringify({
                        success: false,
                        error: 'Worker not found',
                        worker_username,
                    })
                )
            }

            // Prepare notification message
            const message =
                `💰 <b>Payment Collected</b>\n\n` +
                `Client: ${client_username}\n` +
                `Status: Payment received ✅`

            // Send message to worker via Telegram
            await adapterProvider.vendor.telegram.sendMessage(workerTelegramId, message, {
                parse_mode: 'HTML',
            })

            // Log outgoing message
            const { MessageLogger } = await import('~/core/middleware/messageLogger')
            await MessageLogger.logOutgoing(workerTelegramId, workerTelegramId, message, undefined, {
                webhook: 'collector_payment',
                client_username,
                worker_username,
            })

            loggers.app.info(
                { worker_username, workerTelegramId, client_username },
                'Payment notification sent successfully'
            )

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(
                JSON.stringify({
                    success: true,
                    worker_username,
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
