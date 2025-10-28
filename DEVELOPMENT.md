# Development Guide

This guide explains how to set up and run the ISP Bot in development mode.

## Prerequisites

- Node.js 20+ installed
- pnpm package manager
- PostgreSQL database running
- Telegram Bot Token (from BotFather)
- OpenAI API key
- Google AI API key

## Environment Setup

1. **Copy the environment variables:**
   Make sure your `.env` file has all required variables:
   ```env
   # Database
   POSTGRES_DB_HOST=localhost
   POSTGRES_DB_USER=your_db_user
   POSTGRES_DB_NAME=isp_support_bot
   POSTGRES_DB_PASSWORD=your_db_password
   POSTGRES_DB_PORT=5432

   # Server
   PORT=3008
   NODE_ENV=development

   # Telegram
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token

   # AI Services
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_API_KEY=your_google_api_key

   # ISP API (if using customer support features)
   ISP_API_BASE_URL=https://your-isp-api.com
   ISP_API_USERNAME=your_api_username
   ISP_API_PASSWORD=your_api_password
   ISP_ENABLED=true
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure admin users:**
   Edit `src/config/admins.ts` and add your Telegram user ID:
   ```typescript
   export const ADMIN_IDS = [
       'your_telegram_username', // Replace with your username or numeric ID
   ]
   ```

## Running in Development Mode

### Development Mode (Recommended)

```bash
npm run dev
```

**What happens:**
1. ✅ Runs ESLint to check code quality
2. 🚀 Starts the Telegram bot with hot-reload (nodemon)
3. 📋 Shows local server information

**Output you'll see:**
```
🚀 Starting Telegram bot development environment...

📋 Development Environment Ready:
   Local URL: http://localhost:3008
   Health Check: http://localhost:3008/health

🔄 Starting application with nodemon...
```

**Important notes:**
- The bot connects directly to Telegram API
- Press `Ctrl+C` to stop the bot

### Simple Development Mode

If you want to run without additional checks:

```bash
npm run dev:simple
```

**What happens:**
1. ✅ Runs ESLint to check code quality
2. 🚀 Starts the application with hot-reload

## Testing the Bot

1. **Start the bot:**
   ```bash
   npm run dev
   ```

2. **Find your bot on Telegram:**
   - Search for your bot by its username
   - Send `/start` to begin conversation

3. **Test admin features:**
   - Send a message like "bot status" to check if you're configured as admin
   - Use admin commands if your user ID is in `src/config/admins.ts`

## Development Workflow

### Making Changes

1. **Edit your code** - The bot will automatically restart when files change
2. **Check logs** - All bot activities are logged to console
3. **Test commands** - Send messages to your bot to test functionality

### Database Operations

```bash
# Reset local database (WARNING: Deletes all data)
npm run reset:db:local

# Reset server database (WARNING: Deletes all data on server)
npm run reset:db:server
```

### Code Quality

```bash
# Run linting
npm run lint

# Run tests
npm run test
npm run test:watch
npm run test:ui
```

## Troubleshooting

### Bot doesn't respond

**Problem:** Bot is running but not responding to messages

**Solutions:**
1. Verify your `TELEGRAM_BOT_TOKEN` is correct
2. Check that your Telegram user ID is in the whitelist (if whitelist is enabled)
3. Check console logs for any error messages

### Database connection failed

**Problem:** `Failed to connect to database`

**Solutions:**
1. Ensure PostgreSQL is running
2. Verify database credentials in `.env`
3. Check that the database exists

### Permission denied errors

**Problem:** Getting permission errors when accessing bot features

**Solutions:**
1. Add your Telegram user ID to `src/config/admins.ts` for admin features
2. Ensure your number/group is whitelisted if whitelist is enabled
3. Use admin commands to whitelist yourself if you're an admin

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
├── middleware/         # Request processing pipeline
├── flows/              # Conversation flows
├── utils/              # Utilities
│   └── logger.ts       # Pino logger setup
└── app.ts              # Main entry point

scripts/
└── dev.ts              # Dev startup for Telegram bot
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_DB_HOST` | Yes | Database host |
| `POSTGRES_DB_USER` | Yes | Database username |
| `POSTGRES_DB_NAME` | Yes | Database name |
| `POSTGRES_DB_PASSWORD` | Yes | Database password |
| `POSTGRES_DB_PORT` | Yes | Database port |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token from BotFather |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `GOOGLE_API_KEY` | Yes | Google AI API key |

## Next Steps

- Read `CLAUDE.md` for detailed project documentation
- Check `DATABASE_SCHEMA.md` for database structure
- Review flows in `src/flows/` to understand conversation logic
- Test all admin commands to familiarize yourself with bot features