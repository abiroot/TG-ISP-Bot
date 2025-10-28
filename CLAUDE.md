# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram chatbot built with BuilderBot framework (https://builderbot.vercel.app/) that provides AI-powered ISP (Internet Service Provider) customer support with enterprise features including access control, rate limiting, and complete message storage.

**Stack:**
- **BuilderBot** (v1.3.4) - Flow-based chatbot framework
- **Telegram Bot API** - Message provider via @builderbot-plugins/telegram
- **PostgreSQL** + **pgvector** - Database with full message history & vector embeddings
- **AI SDK v5** + GPT-4o-mini - AI conversations (OpenAI/Google AI support)
- **Langchain** - Intent classification & RAG (Retrieval Augmented Generation)
- **TypeScript** (ES2022 modules)
- **Rollup** - Production bundling

## Development Commands

```bash
# Development with Telegram bot (RECOMMENDED)
npm run dev

# Simple development without additional services
npm run dev:simple

# Linting
npm run lint

# Testing
npm run test          # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Run tests with UI

# Production build
npm run build

# Start production server
npm start
```

**Development Workflow:**
- Use `npm run dev` for Telegram bot development
- The bot connects directly to Telegram without requiring webhook tunnels
- Simple development experience with direct Telegram API connection

## Core Architecture

### Three-Adapter Pattern (BuilderBot)

1. **Flow Adapter** - Conversation flows using keyword triggers
2. **Provider Adapter** - Telegram Bot API integration
3. **Database Adapter** - PostgreSQL state management

### Extension System

Services are injected via `extensions` in `createBot()` and accessed within flows:

```typescript
const { aiService, messageService, personalityService } = extensions
```

Available extensions (defined in `src/app.ts:122-157`):
- `aiService` - GPT-4o-mini integration via Vercel AI SDK (with RAG support)
- `intentService` - Langchain-based intent classification for intelligent routing
- `messageService` - Message CRUD operations
- `personalityService` - Bot configuration management
- `whitelistService` - Access control
- `botStateService` - Bot state (maintenance mode, feature flags)
- `transcriptionService` - Voice note transcription
- `imageAnalysisService` - Image analysis with structured output
- `conversationRagService` - RAG (Retrieval Augmented Generation) for unlimited conversation memory
- `embeddingWorkerService` - Background worker for automatic embedding generation

### Flow System

Flows are the fundamental building blocks for conversations:

**Flow Triggers:**
- `addKeyword(['keyword'])` - Exact keyword match
- `addKeyword(EVENTS.WELCOME)` - Catch-all for unmatched messages
- `addKeyword(EVENTS.MEDIA)` - Triggered on media messages
- `addKeyword(EVENTS.VOICE_NOTE)` - Voice notes
- Custom events via `bot.dispatch('EVENT_NAME', ctx)`

**Flow Navigation:**
- `.addAnswer()` - Chain responses
- `.addAction()` - Execute code
- `{ capture: true }` - Capture user input
- `gotoFlow(targetFlow)` - Navigate to another flow
- `fallBack()` - Repeat current step
- `endFlow()` - Terminate conversation

**Flow State:**
- `state.update({ key: value })` - Store conversation state
- `state.get('key')` - Retrieve state
- `flowDynamic(message)` - Send dynamic content

**Flow Order (src/app.ts:69-112):**
```
1. Admin flows (whitelist, maintenance, rate limits, bot management)
2. Version command (available to all users)
3. User flows (help, data wipe)
4. Personality flows (setup for bot configuration)
5. ISP flows (customer information lookup - routed via intent classification)
6. Media flows (voice notes, images - MUST be before welcomeFlow)
7. welcomeFlow (EVENTS.WELCOME - catches all unmatched messages, MUST be LAST)
```

**IMPORTANT**: welcomeFlow MUST always be registered last because it uses `EVENTS.WELCOME` which catches all messages that don't match other keywords. If placed earlier, other flows won't trigger.

### Middleware Pipeline

Centralized middleware in `src/middleware/pipeline.ts` eliminates duplication:

```typescript
// Standard user flows
const result = await runUserMiddleware(ctx, utils)
if (!result.allowed) return
const personality = result.personality!

// Admin flows
const result = await runAdminMiddleware(ctx, utils)
if (!result.allowed) return

// Media flows (no rate limit - handled by debouncer)
const result = await runMediaMiddleware(ctx, utils)
```

**Middleware Checks (in order):**
1. Admin verification (if `requireAdmin: true`)
2. Maintenance mode check (admins can bypass)
3. Rate limiting (admins can bypass)
4. Whitelist verification (admins can bypass)
5. Personality existence

**Individual Middleware:**
- `messageLogger.ts` - Automatic message logging (event-based in app.ts)
- `whitelistCheck.ts` - Access control validation
- `personalityCheck.ts` - Bot configuration loading
- `adminCheck.ts` - Admin privilege verification
- `rateLimitCheck.ts` - Rate limit enforcement

### Database Schema

**Five main tables:**

1. **`whitelisted_groups`** - Group access control
2. **`whitelisted_numbers`** - User access control
3. **`personalities`** - Bot configuration per context (group/private)
4. **`messages`** - Complete message history with 13 optimized indexes
5. **`conversation_embeddings`** - Vector embeddings for RAG (pgvector)

**Key Points:**
- Every message (in/out) is automatically logged to PostgreSQL
- Message logging is event-based (see `src/app.ts:158-177`)
- Embeddings are generated automatically in background for semantic search
- Migrations auto-run on startup from `src/database/migrations/`
- See DATABASE_SCHEMA.md for detailed schema and scaling strategy
- See RAG_IMPLEMENTATION.md for RAG architecture and usage

### Service Layer Architecture

**Repository Pattern:**
- `src/database/repositories/` - Data access layer (raw SQL queries)
- `src/services/` - Business logic layer (wraps repositories)

**Services are injected as extensions** and accessed via:
```typescript
const { aiService } = extensions
```

Never import services directly in flows - always use extensions.

### Langchain Intent Classification

**Hybrid AI Architecture:**
- **Vercel AI SDK v5** - Primary AI layer (chat, image analysis, transcription)
- **Langchain** - Intent classification for intelligent routing

**Intent Service** (`src/services/intentService.ts`):
- Classifies user messages into predefined intents
- Uses GPT-4o-mini with Langchain's `withStructuredOutput()`
- Includes conversation history for context-aware classification

**Intent Categories:**
1. `USER_INFO` - User requesting customer information by phone number
2. `ACCOUNT_STATUS` - User asking about account status or online status
3. `TECHNICAL_SUPPORT` - Technical issues, IP, MAC address, connection problems
4. `BILLING_QUERY` - Billing, account price, expiry dates
5. `NETWORK_INFO` - Network speeds, access points, NAS hosts
6. `CUSTOMER_SEARCH` - User trying to find/search for a customer
7. `GREETING` - Simple greetings
8. `APPRECIATION` - Expressing thanks or gratitude
9. `HELP` - User needs help/guidance
10. `UNKNOWN` - Cannot determine intent (falls back to AI with tools)

**Flow Routing** (`src/flows/ai/chatFlow.ts`):
```typescript
// Intent classification happens in welcomeFlow
const intentResult = await intentService.classifyIntent(ctx.body, recentMessages)

// Route based on confidence (>= 0.7)
if (intentResult.confidence >= 0.7) {
    switch (intentResult.intention) {
        case 'USER_INFO':
        case 'ACCOUNT_STATUS':
        case 'TECHNICAL_SUPPORT':
        case 'BILLING_QUERY':
        case 'NETWORK_INFO':
            return gotoFlow(userInfoFlow) // Route to ISP support flow
        case 'GREETING': return flowDynamic(greetingMessage)
        case 'APPRECIATION': return flowDynamic(appreciationMessage)
        case 'HELP': return flowDynamic(helpMessage)
    }
}
// Low confidence, UNKNOWN, or CUSTOMER_SEARCH -> AI response with ISP tools
```

**ISP Support Flows:**
- `userInfoFlow` - Main ISP support flow with automatic phone number extraction
  - Uses AI to extract phone numbers from natural language
  - Fetches real-time data from ISP management system
  - Provides formatted customer information, account status, and technical details
- `manualPhoneEntryFlow` - Fallback flow when phone number cannot be detected
  - Prompts user to manually enter phone number
  - Same ISP API integration as userInfoFlow

**Benefits:**
- Faster responses for common ISP queries (no full AI call needed)
- Better UX with specialized customer support flows
- Cost reduction (classification cheaper than full AI)
- Real-time ISP data integration through AI SDK tools
- Structured customer information display

### Event System

**Provider Events (src/app.ts):**
```typescript
adapterProvider.on('message', async (ctx) => {
    // Automatically log ALL incoming messages
    await MessageLogger.logIncoming(ctx)
})

adapterProvider.on('send_message', async (payload) => {
    // Automatically log ALL outgoing messages
    await MessageLogger.logOutgoing(from, from, answer)
})
```

**Custom Events:**
```typescript
// Dispatch custom event
bot.dispatch('CUSTOM_EVENT', ctx)

// Listen in flow
addKeyword('CUSTOM_EVENT').addAction(...)
```

### HTTP API

**Built-in Endpoints:**
- `GET /health` - Health check (returns version, status, timestamp)
- `POST /webhook` - Telegram webhook (handled by BuilderBot)

**Add Custom Endpoints (in src/app.ts):**
```typescript
adapterProvider.server.get('/custom', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: 'value' }))
})
```

## Environment Configuration

Environment variables are validated via Zod schema in `src/config/env.ts`.

**Required:**
- `POSTGRES_DB_HOST`, `POSTGRES_DB_USER`, `POSTGRES_DB_NAME`, `POSTGRES_DB_PORT`
- `POSTGRES_DB_PASSWORD` (can be empty string)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token from BotFather
- `OPENAI_API_KEY`

**Optional:**
- `PORT` (default: 3008)
- `NODE_ENV` (development/production/test)
- `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` - For Google AI (Gemini) support

**RAG Configuration (Optional):**
- `RAG_ENABLED` (default: true) - Enable/disable RAG feature
- `RAG_TOP_K_RESULTS` (default: 3) - Number of similar chunks to retrieve
- `RAG_CHUNK_SIZE` (default: 10) - Messages per embedding chunk
- `RAG_CHUNK_OVERLAP` (default: 2) - Overlapping messages between chunks
- `RAG_MIN_SIMILARITY` (default: 0.5) - Minimum similarity threshold
- `RAG_EMBEDDING_MODEL` (default: text-embedding-3-small) - OpenAI embedding model
- `RAG_WORKER_ENABLED` (default: true) - Enable background embedding worker
- `RAG_WORKER_INTERVAL_MS` (default: 60000) - Worker interval (1 minute recommended)
- `RAG_EMBEDDING_BATCH_SIZE` (default: 5) - Contexts to process per cycle
- `RAG_MESSAGES_THRESHOLD` (default: 3) - Trigger embedding after N new messages
- See `.env.example` and `RAG_IMPLEMENTATION.md` for full configuration

**ISP API Configuration (Optional):**
- `ISP_API_BASE_URL` - ISP management system API base URL
- `ISP_API_USERNAME` - API authentication username
- `ISP_API_PASSWORD` - API authentication password
- `ISP_ENABLED` (default: true) - Enable/disable ISP tool calling features

**Admin Configuration:**
Edit `src/config/admins.ts` to add/remove admin Telegram user IDs (numeric IDs or @usernames).

## Admin Commands

Admin-only commands (Telegram user IDs in `src/config/admins.ts`):

**Whitelist Management:**
- `whitelist group` or `/whitelist group` - Whitelist current group
- `whitelist number` or `/whitelist number` - Whitelist a Telegram user
- `remove group` or `/remove group` - Remove current group
- `remove number` or `/remove number` - Remove a Telegram user
- `list whitelist` or `/list whitelist` - Show all whitelisted items

**Bot Management:**
- `enable maintenance` - Enable maintenance mode
- `disable maintenance` - Disable maintenance mode
- `bot status` - Show bot status (version, uptime, maintenance, features)
- `toggle ai` - Toggle AI responses feature
- `toggle voice` - Toggle voice note feature
- `toggle media` - Toggle media analysis feature

**Rate Limit Management:**
- `rate limit status` - Show rate limit configuration
- `reset rate limit` - Reset all rate limits
- `unblock user` - Unblock a rate-limited user

**Personality:**
- `setup personality` - Configure bot personality for current context
- `update personality` - Update existing personality

## Technical Details

**Module System:**
- ES modules (`"type": "module"` in package.json)
- TypeScript path alias: `~/*` → `./src/*` (configured in tsconfig.json)

**Build System:**
- Rollup bundles to single `dist/app.js` file
- Dev server uses `tsx` via nodemon for hot-reload
- Production uses compiled bundle

**Logging:**
- Pino logger with pretty-printing in development
- Namespaced loggers: `loggers.app`, `loggers.telegram`, `createFlowLogger('name')`

**Static Assets:**
- Place in `assets/` directory at project root

**Package Manager:**
- Uses pnpm (configured in Dockerfile)

## Project Structure

```
src/
├── config/              # Configuration and validation
│   ├── env.ts          # Zod environment schema
│   ├── admins.ts       # Admin Telegram user IDs
│   └── database.ts     # DB connection pool
├── database/
│   ├── migrations/     # SQL migrations (auto-run on startup)
│   ├── schemas/        # TypeScript types for tables
│   └── repositories/   # Data access layer
├── services/           # Business logic (injected as extensions)
│   ├── intentService.ts      # Langchain intent classification
│   ├── aiService.ts          # AI SDK chat responses with ISP tools
│   ├── ispApiService.ts      # ISP API integration for customer data
│   ├── ispToolsService.ts    # AI SDK tools for ISP operations
│   └── ...                   # Other services
├── middleware/         # Request processing pipeline
│   └── pipeline.ts     # Centralized middleware composition
├── flows/              # Conversation flows
│   ├── admin/          # Whitelist, maintenance, rate limit flows
│   ├── personality/    # Personality setup
│   ├── isp/            # Customer information lookup flows (Langchain-routed)
│   ├── media/          # Voice notes, images
│   └── ai/             # AI chat with intent classification (welcomeFlow)
├── utils/              # Utilities
│   └── logger.ts             # Pino logger setup
└── app.ts              # Main entry point

scripts/
└── dev.ts              # Dev startup for Telegram bot
```

## Deployment

**Production Deployment (VitoDeploy):**
- Deployed to DigitalOcean server via VitoDeploy (https://vitodeploy.com/docs)
- SSH access: `ssh root@159.223.220.101`
- Project directory: `/home/vito/wup-isp.abiroot.dev`
- **Auto-deploy**: Git push triggers automatic deployment (~2 minutes)
- **IMPORTANT**: Multiple sites run on this server - be cautious with system-level changes
- Deployment script updates require manual intervention - request if needed

**Docker Deployment:**
- Multi-stage Dockerfile using Node 21 Alpine Linux
- Build stage: Compiles TypeScript with pnpm
- Deploy stage: Production image (~400MB) with runtime dependencies only
- Requires `PORT` build argument
- Assets copied from `assets/` directory

## Telegram Bot Configuration

This bot is built specifically for Telegram using the Bot API.

### Setup Requirements
- **Simple Configuration**: Just need `TELEGRAM_BOT_TOKEN` from BotFather
- **Direct Connection**: Bot connects directly to Telegram API
- **No External Services**: No need for ngrok tunnels or webhook configuration

### Admin Configuration
- Add Telegram user IDs in `src/config/admins.ts`
- User IDs can be numeric (e.g., '123456789') or usernames (e.g., '@username')
- To get user IDs, send a message to your bot and check the logs/database

### Environment Variables
- `TELEGRAM_BOT_TOKEN` - Get from BotFather on Telegram
- No webhook or tunnel configuration required

### Benefits
- **Free**: Telegram Bot API is completely free
- **Easy Development**: No external webhook setup required
- **Fast Local Testing**: Direct connection without tunnels
- **Reliable**: Stable connection with automatic reconnection

## Additional Documentation

- **DEVELOPMENT.md** - Development setup instructions
- **DATABASE_SCHEMA.md** - Schema details, indexes, scaling strategy
- **MESSAGE_STORAGE.md** - Message logging system and query examples
- **RAG_IMPLEMENTATION.md** - RAG architecture, configuration, and usage guide
- **TESTING.md** - Testing setup and examples
- I'm using VitoDeploy to deploy on prod server (https://vitodeploy.com/docs/getting-started/introduction/) use crawl4ai to research it.
You can ssh to my VitoServer using `ssh root@159.223.220.101`. The project directory on the server is /home/vito/wup-isp.abiroot.dev
PS: We have multiple sites running on the server, make sure not to break anything and try to use Vito's recommendation
PS: There's an auto deploy script, when we git push it gets deployed on the server. It takes ~2 minutes to finish the deploy. So if you want any change on the server, you must do it here, locally, then git push it
I have to manually update the Vito deploy script. If you want it updated, let me know and I will update it for you and let you know once I do