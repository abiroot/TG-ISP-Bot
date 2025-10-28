-- ISP Support Bot Database Schema
-- This migration creates all necessary tables for the application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drop existing triggers (for development - allows re-running migration)
DROP TRIGGER IF EXISTS update_whitelisted_groups_updated_at ON whitelisted_groups CASCADE;
DROP TRIGGER IF EXISTS update_whitelisted_numbers_updated_at ON whitelisted_numbers CASCADE;
DROP TRIGGER IF EXISTS update_personalities_updated_at ON personalities CASCADE;
DROP TRIGGER IF EXISTS update_message_status_timestamps ON messages CASCADE;

-- Whitelisted Groups
CREATE TABLE IF NOT EXISTS whitelisted_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id TEXT UNIQUE NOT NULL,
    whitelisted_by TEXT NOT NULL,
    whitelisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_groups_group_id ON whitelisted_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_groups_is_active ON whitelisted_groups(is_active);

-- Whitelisted Users for Private Chats (supports phone numbers, Telegram IDs, and usernames)
CREATE TABLE IF NOT EXISTS whitelisted_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_identifier TEXT UNIQUE NOT NULL,
    whitelisted_by TEXT NOT NULL,
    whitelisted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_numbers_user ON whitelisted_numbers(user_identifier);
CREATE INDEX IF NOT EXISTS idx_whitelisted_numbers_is_active ON whitelisted_numbers(is_active);

-- Personalities (per group or private conversation)
CREATE TABLE IF NOT EXISTS personalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    context_id TEXT UNIQUE NOT NULL,
    context_type TEXT NOT NULL CHECK (context_type IN ('group', 'private')),
    bot_name TEXT NOT NULL,
    default_timezone TEXT NOT NULL,
    default_language TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personalities_context_id ON personalities(context_id);
CREATE INDEX IF NOT EXISTS idx_personalities_context_type ON personalities(context_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_whitelisted_groups_updated_at BEFORE UPDATE ON whitelisted_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whitelisted_numbers_updated_at BEFORE UPDATE ON whitelisted_numbers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personalities_updated_at BEFORE UPDATE ON personalities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Messages Table (stores all incoming and outgoing messages)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id TEXT UNIQUE NOT NULL, -- External message ID from provider
    context_id TEXT NOT NULL, -- Group ID or phone number
    context_type TEXT NOT NULL CHECK (context_type IN ('group', 'private')),
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    sender TEXT NOT NULL, -- Phone number of sender
    recipient TEXT, -- Phone number of recipient (for outgoing messages)
    content TEXT, -- Message text content
    media_url TEXT, -- URL to media (if message contains media)
    media_type TEXT, -- Type of media: 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact'
    media_content_type TEXT, -- MIME type of media
    media_size INTEGER, -- Size in bytes
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'queued', 'received')),
    error_message TEXT, -- Error message if status is 'failed'
    metadata JSONB DEFAULT '{}', -- Flexible storage for additional data (raw provider data, etc.)

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,

    -- Reply tracking
    reply_to_message_id UUID, -- Reference to original message if this is a reply

    -- Message classification (for AI/analytics)
    is_bot_command BOOLEAN DEFAULT FALSE,
    is_admin_command BOOLEAN DEFAULT FALSE,
    command_name TEXT, -- Name of command if this is a command message

    -- Soft delete (for compliance/GDPR)
    deleted_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- ============= CRITICAL INDEXES FOR SCALE =============

-- 1. Primary key (automatic) - Unique message identification
-- Already created: id UUID PRIMARY KEY

-- 2. Prevent duplicate messages from provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);

-- 3. MOST IMPORTANT: Conversation history queries (context_id + time-ordered)
-- This index is used for: "Get all messages in a conversation, ordered by time"
-- Covers 90% of queries in production
CREATE INDEX IF NOT EXISTS idx_messages_context_created
    ON messages(context_id, created_at DESC)
    WHERE is_deleted = FALSE;

-- 4. User-specific queries: "Get all messages from a specific user"
CREATE INDEX IF NOT EXISTS idx_messages_sender
    ON messages(sender, created_at DESC)
    WHERE is_deleted = FALSE;

-- 5. Time-based queries and analytics: "Get messages in a date range"
CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at DESC);

-- 6. Monitoring failed messages (partial index = smaller, faster)
-- Only indexes rows where status = 'failed'
CREATE INDEX IF NOT EXISTS idx_messages_failed
    ON messages(context_id, created_at DESC)
    WHERE status = 'failed' AND is_deleted = FALSE;

-- 7. Analytics: Message direction distribution
CREATE INDEX IF NOT EXISTS idx_messages_direction
    ON messages(direction, created_at DESC);

-- 8. Context type queries: Separate group vs private analytics
CREATE INDEX IF NOT EXISTS idx_messages_context_type
    ON messages(context_type, created_at DESC)
    WHERE is_deleted = FALSE;

-- 9. Command tracking and analytics
CREATE INDEX IF NOT EXISTS idx_messages_commands
    ON messages(command_name, created_at DESC)
    WHERE is_bot_command = TRUE OR is_admin_command = TRUE;

-- 10. Reply thread tracking
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
    ON messages(reply_to_message_id)
    WHERE reply_to_message_id IS NOT NULL;

-- 11. JSONB metadata queries (GIN index for flexible querying)
CREATE INDEX IF NOT EXISTS idx_messages_metadata
    ON messages USING GIN (metadata);

-- 12. Media messages filtering
CREATE INDEX IF NOT EXISTS idx_messages_media
    ON messages(context_id, created_at DESC)
    WHERE media_url IS NOT NULL AND is_deleted = FALSE;

-- 13. Composite index for admin dashboards: context + direction + status
CREATE INDEX IF NOT EXISTS idx_messages_context_direction_status
    ON messages(context_id, direction, status, created_at DESC)
    WHERE is_deleted = FALSE;

-- ============= PERFORMANCE OPTIMIZATIONS =============

-- Add constraint to ensure reply_to_message_id references valid messages
-- (Foreign key with ON DELETE SET NULL for data integrity)
-- Drop constraint first if it exists (allows re-running migration)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_reply_to;

ALTER TABLE messages
    ADD CONSTRAINT fk_messages_reply_to
    FOREIGN KEY (reply_to_message_id)
    REFERENCES messages(id)
    ON DELETE SET NULL;

-- Trigger to update delivered_at when status changes to 'delivered'
CREATE OR REPLACE FUNCTION update_message_delivered_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.delivered_at IS NULL THEN
        NEW.delivered_at = CURRENT_TIMESTAMP;
    END IF;
    IF NEW.status = 'read' AND OLD.status != 'read' AND NEW.read_at IS NULL THEN
        NEW.read_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_message_status_timestamps
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_message_delivered_at();

-- ============= FUTURE PARTITIONING PREPARATION =============
-- When we hit 10M+ messages, we can partition by:
-- 1. Time (monthly/yearly): CREATE TABLE messages_2025_01 PARTITION OF messages FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
-- 2. Context type: Separate tables for group vs private messages
-- The current indexes support both strategies

-- Record this migration
INSERT INTO migrations (name) VALUES ('001_init')
ON CONFLICT (name) DO NOTHING;
