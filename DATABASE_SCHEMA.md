# Database Schema

## Overview

The ISP Bot uses PostgreSQL with a fully normalized schema optimized for scale. The database stores:
- Whitelist configuration (groups & numbers)
- Personality settings per context
- **Complete message history** (every single message in/out)

## Tables

### 1. `whitelisted_groups`

Controls which Telegram groups the bot can respond in.

```sql
CREATE TABLE whitelisted_groups (
    id UUID PRIMARY KEY,
    group_id TEXT UNIQUE NOT NULL,
    whitelisted_by TEXT NOT NULL,
    whitelisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `group_id` - Fast lookup
- `is_active` - Filter active groups

### 2. `whitelisted_numbers`

Controls which users can interact with the bot privately. Supports phone numbers, Telegram IDs, and usernames.

```sql
CREATE TABLE whitelisted_numbers (
    id UUID PRIMARY KEY,
    user_identifier TEXT UNIQUE NOT NULL,
    whitelisted_by TEXT NOT NULL,
    whitelisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `user_identifier` - Fast lookup
- `is_active` - Filter active users

### 3. `personalities`

Stores bot configuration per conversation context (group or private chat).

```sql
CREATE TABLE personalities (
    id UUID PRIMARY KEY,
    context_id TEXT UNIQUE NOT NULL,
    context_type TEXT CHECK (context_type IN ('group', 'private')),
    bot_name TEXT NOT NULL,
    default_currency TEXT NOT NULL,
    default_timezone TEXT NOT NULL,
    default_language TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- `context_id` - Primary lookup key
- `context_type` - Filter by type

### 4. `messages` ⭐ MAIN TABLE

Stores **every single message** sent or received by the bot.

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    message_id TEXT UNIQUE NOT NULL,
    context_id TEXT NOT NULL,
    context_type TEXT CHECK (context_type IN ('group', 'private')),
    direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
    sender TEXT NOT NULL,
    recipient TEXT,
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    media_content_type TEXT,
    media_size INTEGER,
    status TEXT CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'queued')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    reply_to_message_id UUID REFERENCES messages(id),
    is_bot_command BOOLEAN DEFAULT FALSE,
    is_admin_command BOOLEAN DEFAULT FALSE,
    command_name TEXT,
    deleted_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);
```

**13 Optimized Indexes for Scale:**

1. ✅ `message_id` (UNIQUE) - Prevent duplicates
2. ✅ `(context_id, created_at DESC)` - **Most important** - conversation history
3. ✅ `(sender, created_at DESC)` - User-specific queries
4. ✅ `created_at DESC` - Time-based queries
5. ✅ `(context_id, created_at DESC) WHERE status='failed'` - Failed message monitoring
6. ✅ `(direction, created_at DESC)` - Analytics
7. ✅ `(context_type, created_at DESC)` - Group vs private analytics
8. ✅ `(command_name, created_at DESC) WHERE is_bot_command=TRUE` - Command tracking
9. ✅ `reply_to_message_id WHERE reply_to_message_id IS NOT NULL` - Thread tracking
10. ✅ `metadata` (GIN) - JSONB queries
11. ✅ `(context_id, created_at DESC) WHERE media_url IS NOT NULL` - Media messages
12. ✅ `(context_id, direction, status, created_at DESC)` - Admin dashboard
13. ✅ All partial indexes exclude `is_deleted=TRUE` for performance

**Triggers:**
- Auto-update `delivered_at` when status changes to 'delivered'
- Auto-update `read_at` when status changes to 'read'

## Relationships

```
whitelisted_groups ──╮
                     ├─> Determines if bot responds
whitelisted_numbers ─╯

personalities ─────> Customizes bot behavior per context

messages.context_id ─────> Links to group_id or phone_number
messages.reply_to_message_id ─> messages.id (self-referential)
```

## Data Flow

1. **Incoming Message**
   - Check if context is whitelisted
   - **Log to messages table**
   - Check if personality exists
   - Process message
   - **Log response to messages table**

2. **Outgoing Message**
   - Generate response
   - Send via provider
   - **Log to messages table**

## Performance

### Current Capacity

| Messages | Query Time | Notes |
|----------|------------|-------|
| 0-1M | <10ms | All indexes in RAM |
| 1M-10M | <50ms | Partial indexes help |
| 10M-100M | <100ms | Enable partitioning |
| 100M+ | <200ms | Read replicas + archival |

### Scaling Strategy

**Phase 1: 0-10M messages**
- Current setup (no changes needed)

**Phase 2: 10M-100M messages**
- Enable time-based partitioning:
  ```sql
  CREATE TABLE messages_2025_01 PARTITION OF messages
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
  ```

**Phase 3: 100M+ messages**
- Separate read replicas
- Archive old messages to cold storage
- Implement message retention policy

## Migrations

All schema changes are managed in:
```
src/database/migrations/001_init.sql
```

Run migrations:
```bash
npm run dev  # Automatically runs migrations
```

## Query Examples

### Get conversation history
```sql
SELECT * FROM messages
WHERE context_id = 'group_123'
  AND is_deleted = FALSE
ORDER BY created_at DESC
LIMIT 100;
```

### Get failed messages
```sql
SELECT * FROM messages
WHERE status = 'failed'
  AND is_deleted = FALSE
ORDER BY created_at DESC
LIMIT 50;
```

### Get message statistics
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE direction = 'incoming') as incoming,
  COUNT(*) FILTER (WHERE direction = 'outgoing') as outgoing,
  COUNT(*) FILTER (WHERE media_url IS NOT NULL) as with_media
FROM messages
WHERE context_id = 'group_123'
  AND is_deleted = FALSE;
```

## Backup Strategy

### Daily Backups
```bash
pg_dump -U abiroot tg-isp > backup_$(date +%Y%m%d).sql
```

### Point-in-Time Recovery
Enable WAL archiving in PostgreSQL config:
```
wal_level = replica
archive_mode = on
archive_command = 'cp %p /path/to/archive/%f'
```

## Monitoring

### Table Sizes
```sql
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Index Usage
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE tablename = 'messages'
ORDER BY idx_scan DESC;
```

### Unused Indexes
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelid NOT IN (
    SELECT indexrelid FROM pg_index WHERE indisunique
  )
ORDER BY pg_relation_size(indexrelid) DESC;
```

## Security

- ✅ No raw passwords stored
- ✅ UUID primary keys (not sequential)
- ✅ Soft delete for compliance
- ✅ JSONB for flexible metadata
- ✅ Foreign key constraints
- ✅ Check constraints for data integrity

## Documentation

- `MESSAGE_STORAGE.md` - Comprehensive message storage guide
- `DATABASE_SCHEMA.md` - This file
- `DEVELOPMENT.md` - Development setup
