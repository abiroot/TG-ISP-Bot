# Telegram User Management Guide

This guide explains how the bot manages Telegram users, the `telegram_user_mapping` table, and the identifier system used throughout the codebase.

## Table of Contents
- [Overview](#overview)
- [Database Schema](#database-schema)
- [Identifier Hierarchy](#identifier-hierarchy)
- [Auto-Capture System](#auto-capture-system)
- [TelegramUserHelper Utility](#telegramuserhelper-utility)
- [Webhook Integration](#webhook-integration)
- [Getting Telegram IDs](#getting-telegram-ids)
- [Admin Configuration](#admin-configuration)
- [Best Practices](#best-practices)

---

## Overview

The bot implements a comprehensive user management system that:

1. **Auto-captures** every Telegram user who interacts with the bot
2. **Maps** billing system worker usernames to Telegram IDs
3. **Enables webhooks** to send notifications to users by worker username
4. **Provides self-service** ID retrieval for whitelisting and admin setup

**Key Principle:** Every conversation is guaranteed to be captured in `telegram_user_mapping` before any flow executes.

---

## Database Schema

### telegram_user_mapping Table

```sql
CREATE TABLE telegram_user_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Worker username from billing system (derived from first_name)
    worker_username VARCHAR(255) NOT NULL UNIQUE,

    -- Telegram numeric user ID (primary identifier, permanent)
    telegram_id VARCHAR(50) NOT NULL,

    -- Telegram @username (optional, can change)
    telegram_handle VARCHAR(255),

    -- User profile data from Telegram
    first_name VARCHAR(255),
    last_name VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_telegram_user_mapping_worker_username ON telegram_user_mapping(worker_username);
CREATE INDEX idx_telegram_user_mapping_telegram_id ON telegram_user_mapping(telegram_id);
```

### Column Descriptions

| Column | Type | Purpose | Example |
|--------|------|---------|---------|
| `worker_username` | VARCHAR(255) UNIQUE | Worker username from billing system (lowercase first_name, no spaces) | `"josianeyoussef"` |
| `telegram_id` | VARCHAR(50) | Telegram numeric user ID (permanent, never changes) | `"341628148"` |
| `telegram_handle` | VARCHAR(255) | Telegram @username (optional, can be changed by user) | `"SOLamyy"` |
| `first_name` | VARCHAR(255) | User's first name from Telegram profile | `"Josiane"` |
| `last_name` | VARCHAR(255) | User's last name from Telegram profile (optional) | `"Youssef"` |

### Why Two Types of Usernames?

- **worker_username**: Billing system identifier (stable, derived from name)
- **telegram_handle**: Social media @username (unstable, user can change it)

**Example:**
```typescript
{
    worker_username: "josianeyoussef",  // From first_name (billing system)
    telegram_handle: "SOLamyy",         // Telegram @username (social)
    telegram_id: "341628148"            // Primary identifier (permanent)
}
```

---

## Identifier Hierarchy

### Primary Identifier: telegram_id

**Always use `telegram_id` as the primary identifier:**

✅ **Why telegram_id is Best:**
- **Permanent**: Never changes, even if user changes name or @username
- **Unique**: Guaranteed unique across all Telegram
- **Secure**: Cannot be hijacked by other users
- **Reliable**: Always available from Telegram API

❌ **Why telegram_handle is NOT Reliable:**
- Users can change their @username at any time
- Not all users have a @username (optional in Telegram)
- Username can be hijacked if user deletes it
- Should NEVER be used as primary identifier

### Context Type Detection

```typescript
import { getContextType } from '~/core/types/telegram'

const contextType = getContextType(ctx.from)
// Returns: 'private' or 'group'

// Group IDs start with '-'
if (ctx.from.startsWith('-')) {
    // This is a group chat
}
```

---

## Auto-Capture System

### How It Works

**Event-Based Capture** (`src/app.ts:312-315`):
```typescript
adapterProvider.on('message', async (ctx) => {
    // Automatically log ALL incoming messages
    await MessageLogger.logIncoming(ctx)

    // Auto-capture user mapping (non-blocking)
    captureUserMapping(ctx).catch((err) => {
        loggers.telegram.warn({ err }, 'User mapping capture failed (non-critical)')
    })
})
```

**Middleware** (`src/core/middleware/userMappingMiddleware.ts`):
```typescript
export async function captureUserMapping(ctx: BotCtx): Promise<void> {
    // 1. Extract user data using TelegramUserHelper
    const userData = TelegramUserHelper.extractUserData(ctx)

    // 2. Upsert to database (create or update)
    const userMapping = await telegramUserService.upsertUser({
        worker_username: userData.workerUsername,
        telegram_id: userData.telegramId,
        telegram_handle: userData.telegramHandle,
        first_name: userData.firstName,
        last_name: userData.lastName,
    })
}
```

### Username Derivation Logic

**Worker username is derived from first_name:**

```typescript
// Example: "Josiane Youssef" → "josianeyoussef"
const workerUsername = firstName.toLowerCase().replace(/\s+/g, '')

// Fallback if no name: "user_{telegram_id}"
if (!firstName) {
    workerUsername = `user_${telegramId}`
}
```

### Conflict Resolution

If worker username already exists, **automatic number appending**:

```typescript
// First user: "josiane"
// Second user with same name: "josiane2"
// Third user: "josiane3"
// ... and so on

// Uses regex to find next available number
// Max 5 retries with automatic increment
```

**Example:**
```sql
-- Existing records
SELECT worker_username FROM telegram_user_mapping;
-- josiane
-- josiane2

-- New user "Josiane" arrives
-- System assigns: "josiane3"
```

---

## TelegramUserHelper Utility

### Purpose

Centralized utility for extracting Telegram user data with consistent logic across the codebase.

**Location:** `src/core/utils/TelegramUserHelper.ts`

### Usage Examples

#### Extract Complete User Data
```typescript
import { TelegramUserHelper } from '~/core/utils/TelegramUserHelper'

const userData = TelegramUserHelper.extractUserData(ctx)
// Returns:
{
    telegramId: "341628148",
    firstName: "Josiane",
    lastName: "Youssef",
    telegramHandle: "SOLamyy",
    workerUsername: "josianeyoussef",
    contextType: "private"
}
```

#### Get Specific Fields
```typescript
// Get Telegram ID (primary identifier)
const telegramId = TelegramUserHelper.getTelegramId(ctx)
// Returns: "341628148"

// Get first name
const firstName = TelegramUserHelper.getFirstName(ctx)
// Returns: "Josiane"

// Get Telegram handle (@username)
const handle = TelegramUserHelper.getTelegramHandle(ctx)
// Returns: "SOLamyy" (without @ prefix)

// Get worker username (for billing system)
const workerUsername = TelegramUserHelper.getWorkerUsername(ctx)
// Returns: "josianeyoussef"

// Get full name
const fullName = TelegramUserHelper.getFullName(ctx)
// Returns: "Josiane Youssef"
```

#### Context Type Checks
```typescript
// Check if group chat
if (TelegramUserHelper.isGroupContext(ctx)) {
    // Group-specific logic
}

// Check if private chat
if (TelegramUserHelper.isPrivateContext(ctx)) {
    // Private chat-specific logic
}
```

#### User Mentions
```typescript
// Get user mention for display
const mention = TelegramUserHelper.getUserMention(ctx)
// Returns: "@SOLamyy" if username exists
// Returns: "Josiane Youssef" if no username
```

### Benefits

✅ **Single source of truth** - All extraction logic in one place
✅ **Type-safe** - Full TypeScript support with proper types
✅ **Consistent** - Same logic used everywhere
✅ **Maintainable** - Easy to update extraction logic
✅ **Tested** - Centralized logic easier to test

---

## Webhook Integration

### ISP Webhook Payload

When ISP billing system sends webhooks, it uses this structure:

```json
{
  "worker_username": "<worker username from billing system>",
  "client_username": "<client username from billing system>",
  "tg_username": "<optional telegram handle>"
}
```

### Worker Lookup Process

**Step 1: Webhook receives `worker_username`**
```json
{
  "worker_username": "josianeyoussef"
}
```

**Step 2: Lookup Telegram ID**
```typescript
const telegramId = await telegramUserService.getTelegramIdByUsername("josianeyoussef")
// Returns: "341628148"
```

**Step 3: Send notification to worker**
```typescript
await provider.vendor.telegram.sendMessage(telegramId, message)
```

### Database Query

```sql
-- Webhook lookup query
SELECT telegram_id
FROM telegram_user_mapping
WHERE worker_username = 'josianeyoussef';

-- Returns: '341628148'
```

---

## Getting Telegram IDs

### Method 1: /getmyid Command (Easiest)

**Available to all users:**

```
User: /getmyid

Bot:
📋 Your Telegram Information

Name: Josiane Youssef
Username: @SOLamyy
Telegram ID: 341628148
Context: Private Chat

💡 Tip: Tap the ID to copy it. Use this ID for whitelisting or admin configuration.
```

**Command aliases:**
- `/getmyid`
- `/myid`
- `getmyid`
- `myid`

### Method 2: Admin User Listing

**Admin-only command:**

```
Admin: /users

Bot:
👥 Telegram User Mappings

Total Users: 15

• josianeyoussef
  └ Telegram ID: 341628148
  └ Handle: @SOLamyy
  └ Name: Josiane Youssef
  └ Roles: admin, worker
  └ Created: 2025-10-28 14:23:15
  └ Updated: 2025-11-02 09:45:32

...
```

### Method 3: Database Query

```sql
-- Get all users with IDs
SELECT
    worker_username,
    telegram_id,
    telegram_handle,
    first_name,
    last_name,
    created_at
FROM telegram_user_mapping
ORDER BY created_at DESC;
```

---

## Admin Configuration

### Adding Admins

**File:** `src/config/admins.ts`

```typescript
export const ADMIN_IDS: string[] = [
    '5795384135', // Jhonny Hachem
    '341628148',  // Lamba - Dev/Testing account
    // Add more numeric Telegram IDs here:
    // '123456789', // New Admin Name
]
```

### Security Best Practices

✅ **DO:**
- Use numeric Telegram IDs (`'341628148'`)
- Get IDs via `/getmyid` command
- Store IDs in config file
- Use IDs in database seeders

❌ **DON'T:**
- Use @usernames for admins (can be hijacked)
- Hardcode usernames in security-critical code
- Rely on `telegram_handle` for authorization

### Database Seeder

**File:** `src/database/migrations/001_init.sql`

```sql
-- Insert default admin user (using numeric Telegram ID for security)
-- Use /getmyid command to find your Telegram ID
INSERT INTO whitelisted_users (user_identifier, whitelisted_by, notes)
VALUES ('341628148', 'system', 'Telegram admin user (Lamba)')
ON CONFLICT (user_identifier) DO NOTHING;
```

---

## Best Practices

### ✅ DO

1. **Always use `telegram_id` as primary identifier**
   ```typescript
   const userId = TelegramUserHelper.getTelegramId(ctx)
   ```

2. **Use TelegramUserHelper for all data extraction**
   ```typescript
   const userData = TelegramUserHelper.extractUserData(ctx)
   ```

3. **Use numeric IDs for admin configuration**
   ```typescript
   export const ADMIN_IDS = ['341628148', '5795384135']
   ```

4. **Store both worker_username and telegram_id**
   ```typescript
   {
       worker_username: "josianeyoussef", // For billing system
       telegram_id: "341628148"           // For bot operations
   }
   ```

5. **Handle username conflicts with number suffixes**
   ```typescript
   // Automatic: josiane → josiane2 → josiane3
   ```

### ❌ DON'T

1. **Never use telegram_handle as primary identifier**
   ```typescript
   // BAD: User can change this
   const userId = ctx.username
   ```

2. **Never manually extract user data from ctx**
   ```typescript
   // BAD: Inconsistent extraction logic
   const name = ctx.name || ctx.messageCtx?.update?.message?.from?.first_name

   // GOOD: Use helper
   const name = TelegramUserHelper.getFirstName(ctx)
   ```

3. **Never skip auto-capture**
   ```typescript
   // Auto-capture runs automatically on EVERY message
   // Don't try to manually capture unless you have a specific reason
   ```

4. **Never assume telegram_handle exists**
   ```typescript
   // BAD: May be undefined
   const handle = userData.telegram_handle

   // GOOD: Check existence
   if (userData.telegramHandle) {
       // Use handle
   }
   ```

---

## Migration Notes

### Updating from Old Column Names

If you have existing code using old column names:

**Old → New Mapping:**
```typescript
// Database columns
username          → worker_username
telegram_username → telegram_handle

// TypeScript interfaces
TelegramUserMapping.username          → TelegramUserMapping.worker_username
TelegramUserMapping.telegram_username → TelegramUserMapping.telegram_handle

// Repository methods (already updated)
getUserByUsername()    // Uses worker_username
getTelegramIdByUsername() // Uses worker_username
```

**Migration SQL:**
```sql
-- Migration 005 handles all column renames
-- Run migrations to update: npm run dev
```

---

## Related Documentation

- **Database Schema:** `DATABASE_SCHEMA.md`
- **Message Storage:** `MESSAGE_STORAGE.md`
- **Admin Commands:** `CLAUDE.md#admin-commands`
- **Flow System:** `CLAUDE.md#flow-system`

---

## Support

**Questions?**
- Check `CLAUDE.md` for general bot documentation
- Use `/help` command in bot for user assistance
- Use `/users` admin command to inspect user mappings
- Use `/getmyid` to get your own Telegram ID

**Last Updated:** 2025-11-02
**Version:** Bot v1.0.0
