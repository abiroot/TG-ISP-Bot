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
import { logger, loggers } from '~/utils/logger'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'))
export const APP_VERSION = packageJson.version

// Import all flows
import {
    whitelistGroupFlow,
    whitelistUserFlow,
    removeGroupFlow,
    removeUserFlow,
    listWhitelistFlow,
    enableMaintenanceFlow,
    disableMaintenanceFlow,
    botStatusFlow,
    toggleFeatureFlow,
    rateLimitStatusFlow,
    resetRateLimitFlow,
    unblockUserFlow,
    adminHelpFlow,
    versionFlow,
    wipeDataFlow,
    userHelpFlow,
    personalitySetupFlow,
    firstTimeUserFlow,
    userInfoFlow,
    manualPhoneEntryFlow,
    voiceNoteFlow,
    mediaFlow,
    locationFlow,
    pingFlow,
    mikrotikMonitorFlow,
    mikrotikUsersFlow,
    welcomeFlow,
} from '~/flows'

// Import example flows
import {
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
} from '~/flows/examples'

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

  
    // Create flow with all registered flows
    const adapterFlow = createFlow([
        // Admin flows (whitelist management)
        whitelistGroupFlow,
        whitelistUserFlow,
        removeGroupFlow,
        removeUserFlow,
        listWhitelistFlow,

        // Admin flows (bot management)
        enableMaintenanceFlow,
        disableMaintenanceFlow,
        botStatusFlow,
        toggleFeatureFlow,

        // Admin flows (rate limit management)
        rateLimitStatusFlow,
        resetRateLimitFlow,
        unblockUserFlow,

        // Admin help
        adminHelpFlow,

        // Version command (available to all users)
        versionFlow,

        // User flows (help, data wipe)
        userHelpFlow,
        wipeDataFlow,

        // Personality flows (setup handles both create and update)
        personalitySetupFlow,
        firstTimeUserFlow, // Automatic setup for first-time users

        // ISP Support flows (user information lookup with ISP API integration)
        userInfoFlow,
        manualPhoneEntryFlow,
        mikrotikMonitorFlow,
        mikrotikUsersFlow,

        // Media flows (MUST be before welcome flow to catch media events)
        voiceNoteFlow,
        mediaFlow,
        locationFlow,

        // Test flows (for development and testing)
        pingFlow,

        // Example flows (button demonstrations)
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

        // Welcome flow (EVENTS.WELCOME - catches all unmatched messages with Langchain intent classification, must be last)
        welcomeFlow,
    ])

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

    // Import services for extensions
    const { aiService } = await import('~/services/aiService')
    const { intentService } = await import('~/services/intentService')
    const { messageService } = await import('~/services/messageService')
    const { personalityService } = await import('~/services/personalityService')
    const { whitelistService } = await import('~/services/whitelistService')
    const { userService } = await import('~/services/userService')
    const { botStateService } = await import('~/services/botStateService')
    const { transcriptionService } = await import('~/services/transcriptionService')
    const { imageAnalysisService } = await import('~/services/imageAnalysisService')
    const { conversationRagService } = await import('~/services/conversationRagService')
    const { embeddingWorkerService } = await import('~/services/embeddingWorkerService')
    const { toolExecutionAuditService } = await import('~/services/toolExecutionAuditService')

    // Create bot with queue configuration and extensions
    const { handleCtx, httpServer } = await createBot(
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
                aiService,
                intentService,
                messageService,
                personalityService,
                whitelistService,
                userService,
                botStateService,
                transcriptionService,
                imageAnalysisService,
                conversationRagService,
                embeddingWorkerService,
                toolExecutionAuditService,
            },
        }
    )

    // Event-based message logging - automatically log ALL incoming messages
    adapterProvider.on('message', async (ctx) => {
        try {
            const { MessageLogger } = await import('~/middleware/messageLogger')
            await MessageLogger.logIncoming(ctx)
        } catch (error) {
            loggers.telegram.error({ err: error }, 'Failed to log incoming message via event')
        }
    })

    // Event-based outgoing message logging - automatically log ALL outgoing messages
    const bot = await import('@builderbot/bot')
    adapterProvider.on('send_message', async (payload) => {
        try {
            const { MessageLogger } = await import('~/middleware/messageLogger')
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

                loggers.telegram.debug(
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

                loggers.telegram.debug(
                    { eventName, prefix, data, chatId },
                    'Dispatching button event to flows'
                )

                // Create a synthetic message context for the button click
                const syntheticCtx = {
                    from: chatId?.toString() || userId.toString(),
                    body: eventName, // Event name for keyword matching
                    name: callbackQuery.from.first_name || 'User',
                    pushName: callbackQuery.from.first_name || 'User',
                    _callback_query: callbackQuery, // Original callback query
                    _button_data: data, // Parsed data after colon
                }

                // Handle the context through the bot's flow system
                await (handleCtx as any)(syntheticCtx)
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

    // Start HTTP server
    // Note: TwilioProvider doesn't have initHttpServer method, using httpServer from createBot
    httpServer(PORT)

    // Start RAG embedding worker service
    try {
        embeddingWorkerService.start()
        const workerConfig = embeddingWorkerService.getConfig()
        loggers.app.info(
            {
                enabled: workerConfig.enabled,
                intervalMinutes: Math.round(workerConfig.intervalMs / 60000),
                batchSize: workerConfig.batchSize,
            },
            '🤖 RAG embedding worker started'
        )
    } catch (error) {
        loggers.app.error({ err: error }, 'Failed to start RAG embedding worker (non-fatal)')
    }

    loggers.app.info('✅ ISP Support Bot is running!')
    loggers.app.info('📱 Telegram bot configured')
    loggers.app.info({ port: PORT }, '🌐 HTTP server started')
    loggers.app.info({ url: `http://localhost:${PORT}/health` }, '🔍 Health check endpoint')
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    loggers.app.info('Received SIGINT signal, shutting down gracefully...')

    // Stop RAG worker
    try {
        const { embeddingWorkerService } = await import('~/services/embeddingWorkerService')
        embeddingWorkerService.stop()
        loggers.app.info('RAG embedding worker stopped')
    } catch (error) {
        loggers.app.error({ err: error }, 'Error stopping RAG worker')
    }

    // Close database connection
    const { closeConnection } = await import('~/config/database')
    await closeConnection()
    process.exit(0)
})

process.on('SIGTERM', async () => {
    loggers.app.info('Received SIGTERM signal, shutting down gracefully...')

    // Stop RAG worker
    try {
        const { embeddingWorkerService } = await import('~/services/embeddingWorkerService')
        embeddingWorkerService.stop()
        loggers.app.info('RAG embedding worker stopped')
    } catch (error) {
        loggers.app.error({ err: error }, 'Error stopping RAG worker')
    }

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
