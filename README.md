# TG-ISP-Bot

Enterprise-grade AI-powered Telegram chatbot for Internet Service Provider (ISP) customer support.

[![Version](https://img.shields.io/badge/version-1.0.13-blue.svg)](https://github.com/abiroot/TG-ISP-Bot)
[![Node](https://img.shields.io/badge/node-21-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)](LICENSE)

## Overview

TG-ISP-Bot provides intelligent customer support through Telegram with AI-powered conversations, real-time ISP account lookups, location management, and comprehensive admin controls.

**Key Features:**
- 🤖 AI conversations with Gemini 2.0 Flash (Vercel AI SDK v5)
- 🔍 Real-time ISP customer lookup with 4 AI SDK tools
- 📍 Location management with Google Maps integration
- 💰 Billing system integration for task creation
- 🗄️ Complete message storage with RAG knowledge base
- 🔐 Enterprise access control (whitelist + RBAC)
- 📊 Admin dashboard with 25+ commands

## Tech Stack

- **BuilderBot** (v1.3.4) - Flow-based chatbot framework
- **Telegram Bot API** - Message provider
- **PostgreSQL + pgvector** - Database with vector embeddings
- **Gemini 2.0 Flash** - Primary AI (Vercel AI SDK v5)
- **OpenAI** - Embeddings only (text-embedding-3-small)
- **TypeScript** ES2022 modules
- **Node.js 21 Alpine** - Production runtime

## Quick Start

### Prerequisites

- Node.js 21+ and pnpm
- PostgreSQL 14+ with pgvector extension
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Google API Key (for Gemini AI + Google Maps)
- OpenAI API Key (for embeddings)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/abiroot/TG-ISP-Bot.git
   cd TG-ISP-Bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your credentials:
   ```bash
   # Database
   POSTGRES_DB_HOST=localhost
   POSTGRES_DB_USER=postgres
   POSTGRES_DB_NAME=isp_bot
   POSTGRES_DB_PASSWORD=your_password
   POSTGRES_DB_PORT=5432

   # Telegram
   TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

   # AI Services
   GOOGLE_API_KEY=your_google_api_key  # Gemini AI + Google Maps
   OPENAI_API_KEY=your_openai_api_key  # Embeddings only

   # ISP API (optional)
   ISP_API_BASE_URL=https://your-isp-api.com
   ISP_API_USERNAME=your_username
   ISP_API_PASSWORD=your_password

   # Billing API (optional)
   BILLING_API_BASE_URL=https://your-billing-system.com
   BILLING_USERNAME=your_username
   BILLING_PASSWORD=your_password
   ```

4. **Setup PostgreSQL database**
   ```sql
   CREATE DATABASE isp_bot;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

   Migrations run automatically on startup.

5. **Configure admins**
   Edit `src/config/admins.ts` to add your Telegram user ID:
   ```typescript
   export const ADMIN_IDS = [
       '123456789', // Your Telegram ID
   ]
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

   The bot connects directly to Telegram - no webhook or ngrok required!

## Development Commands

```bash
# Development
npm run dev              # Start with Telegram bot (RECOMMENDED)
npm run dev:simple      # Simple dev without extra services

# Code Quality
npm run lint            # Run ESLint
npm run typecheck       # TypeScript type checking

# Testing
npm run test            # Run tests once
npm run test:watch      # Run tests in watch mode
npm run test:ui         # Run tests with UI

# Build & Production
npm run build           # Build for production (Rollup)
npm start               # Run production build

# Database
npm run db:reset        # Reset local database
npm run seed:users      # Seed Telegram users
npm run seed:roles      # Seed user roles
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB_*` | Database connection details |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather |
| `GOOGLE_API_KEY` | Google AI + Maps API key |
| `OPENAI_API_KEY` | OpenAI API key (embeddings only) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3008 | HTTP server port |
| `NODE_ENV` | development | Environment mode |
| `ISP_API_*` | - | ISP management system integration |
| `BILLING_API_*` | - | Billing system integration |
| `RAG_ENABLED` | true | Enable RAG knowledge base |
| `GOOGLE_MAPS_ENABLED` | true | Enable Maps API integration |

See `.env.example` for complete configuration options.

## Project Structure

```
├── src/
│   ├── app.ts                    # Main application entry
│   ├── config/                   # Configuration & validation
│   │   ├── env.ts               # Zod environment schema
│   │   ├── admins.ts            # Admin user IDs
│   │   └── database.ts          # DB connection pool
│   ├── database/
│   │   ├── migrations/          # Auto-run SQL migrations
│   │   ├── schemas/             # TypeScript table types
│   │   └── repositories/        # Data access layer
│   ├── services/                # Business logic services
│   │   ├── ISPService.ts        # ISP API integration
│   │   ├── BillingService.ts    # Billing integration
│   │   └── ...                  # Other services
│   ├── middleware/              # Request processing
│   ├── flows/                   # BuilderBot conversation flows
│   │   ├── admin/              # Admin-only flows
│   │   ├── isp/                # Customer support flows
│   │   ├── ai/                 # AI chat flows
│   │   └── ...                 # Other feature flows
│   └── utils/                   # Utility functions
├── docs/                        # Documentation
├── tests/                       # Unit & E2E tests
├── scripts/                     # Dev & deployment scripts
└── assets/                      # Static assets
```

## Core Features

### AI & Automation
- Gemini 2.0 Flash integration via Vercel AI SDK v5
- RAG knowledge base with pgvector for semantic search
- Auto-embeddings background worker
- Tool calling for ISP API integration
- Voice transcription (Whisper) and image analysis

### ISP Integration
- Real-time customer lookup (phone/username)
- Account status tracking (online/offline, active/archived)
- Technical support data (IP addresses, connection speeds)
- Billing information (pricing, expiry dates)
- Mikrotik interface monitoring
- Location management with Google Maps

### Billing System Integration
- Cookie-based session authentication
- Task creation (maintenance, installation, support, upgrade)
- Worker assignment via billing system
- WhatsApp notification preference (sent by billing system, not bot)
- Automatic re-authentication on session expiry

### Enterprise Features
- **Complete Message Storage** - Every message logged to PostgreSQL
- **Access Control** - Whitelist system + RBAC (admin/collector/worker)
- **Role-Based Permissions** - Tool-level access control
- **Rate Limiting** - Per-user rate limits with admin bypass
- **Maintenance Mode** - Global bot disable with admin access
- **Feature Toggles** - Runtime enable/disable for AI, voice, media, ISP, RAG
- **Audit Logging** - Tool execution tracking with performance metrics

## Admin Commands

### Whitelist Management
```
whitelist group          # Whitelist current group
whitelist number         # Whitelist a Telegram user
remove group             # Remove whitelisted group
remove number            # Remove whitelisted user
list whitelist           # Show all whitelisted items
```

### Bot Management
```
enable maintenance       # Enable maintenance mode
disable maintenance      # Disable maintenance mode
bot status              # Show bot status + features
toggle ai / voice / media / isp / rag
```

### Role Management
```
/set role <user_id> <role>      # Replace user's roles
/add role <user_id> <role>      # Add role (keep existing)
/remove role <user_id> <role>   # Remove specific role
/show role <user_id>            # Display user's roles
/list roles                     # Show all role assignments
```

### User Management
```
/users                  # List all Telegram users
/unfulfilled            # List unfulfilled location requests
```

## Deployment

### Docker

```bash
# Build
docker build --build-arg PORT=3010 -t tg-isp-bot .

# Run
docker run -d \
  -p 3010:3010 \
  --env-file .env \
  --name tg-isp-bot \
  tg-isp-bot
```

### VitoDeploy (Production)

The bot is deployed to DigitalOcean via VitoDeploy:
- **Auto-deploy**: Git push to `main` triggers deployment (~2-3 minutes)
- **Process Manager**: Supervisor manages the Node.js process
- **Health Checks**: Automatic verification after deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment guide.

## Documentation

- [Architecture Overview](CLAUDE.md) - Comprehensive developer guide
- [ISP API Integration](docs/ISP_API_INTEGRATION.md) - ISP management system
- [Billing API Integration](docs/BILLING_API_INTEGRATION.md) - Billing system
- [Google Maps Integration](docs/GOOGLE_MAPS_INTEGRATION.md) - Maps API usage
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment
- [Monitoring Guide](docs/MONITORING.md) - Logging and observability
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions

## Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# With UI
npm run test:ui
```

Tests include:
- Unit tests for services and utilities
- E2E tests for conversation flows
- Integration tests for external APIs

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Development Guidelines:**
- Follow TypeScript strict mode
- Add tests for new features
- Update documentation
- Run `npm run lint` before committing
- Follow commit message conventions (feat/fix/docs/refactor)

## License

ISC License - See [LICENSE](LICENSE) file for details.

## Links

- **GitHub Repository**: https://github.com/abiroot/TG-ISP-Bot
- **Linear Project**: https://linear.app/abiroot/project/tg-isp-bot-607998d53e53
- **Notion Documentation**: https://www.notion.so/2aeb8e4fb5418155bd00dcea49106771

## Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Contact: ayman@abiroot.com

---

**Version:** 1.0.13 | **Status:** Production | **Main Branch:** main
