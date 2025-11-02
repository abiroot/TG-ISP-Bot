-- ISP Support Bot Database Schema - Consolidated Migration
-- This migration creates all necessary tables, indexes, and triggers for the application
-- All timestamps use TIMESTAMP WITH TIME ZONE for consistency
-- Created: 2025-11-01

-- ============= EXTENSIONS =============

-- Enable UUID extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector extension for vector similarity search (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============= MIGRATIONS TRACKING =============

-- Table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============= UTILITY FUNCTIONS =============

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============= ACCESS CONTROL TABLES =============

-- Whitelisted Groups (for group chats)
CREATE TABLE IF NOT EXISTS whitelisted_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id TEXT UNIQUE NOT NULL,
    whitelisted_by TEXT NOT NULL,
    whitelisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_groups_group_id ON whitelisted_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_whitelisted_groups_is_active ON whitelisted_groups(is_active);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_whitelisted_groups_updated_at ON whitelisted_groups CASCADE;
CREATE TRIGGER update_whitelisted_groups_updated_at
    BEFORE UPDATE ON whitelisted_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Whitelisted Users for Private Chats (supports Telegram usernames and numeric IDs)
CREATE TABLE IF NOT EXISTS whitelisted_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_identifier TEXT UNIQUE NOT NULL,  -- Telegram username or numeric ID
    whitelisted_by TEXT NOT NULL,
    whitelisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whitelisted_users_user_identifier ON whitelisted_users(user_identifier);
CREATE INDEX IF NOT EXISTS idx_whitelisted_users_is_active ON whitelisted_users(is_active);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_whitelisted_users_updated_at ON whitelisted_users CASCADE;
CREATE TRIGGER update_whitelisted_users_updated_at
    BEFORE UPDATE ON whitelisted_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE whitelisted_users IS 'Telegram users whitelisted to access the bot (supports numeric IDs and @usernames)';
COMMENT ON COLUMN whitelisted_users.user_identifier IS 'Telegram user ID (numeric) or username (with or without @)';

-- ============= BOT CONFIGURATION =============

-- Personalities (per group or private conversation)
CREATE TABLE IF NOT EXISTS personalities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    context_id TEXT UNIQUE NOT NULL,
    context_type TEXT NOT NULL CHECK (context_type IN ('group', 'private')),
    bot_name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personalities_context_id ON personalities(context_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_personalities_updated_at ON personalities CASCADE;
CREATE TRIGGER update_personalities_updated_at
    BEFORE UPDATE ON personalities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Bot State (persistent bot configuration across restarts)
CREATE TABLE IF NOT EXISTS bot_state (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_state_updated_at ON bot_state(updated_at);

-- Insert default values
INSERT INTO bot_state (key, value) VALUES
    ('maintenance_mode', '{"enabled": false, "message": null}'::jsonb),
    ('features_enabled', '{"ai_responses": true, "voice_transcription": true, "image_analysis": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Comments
COMMENT ON TABLE bot_state IS 'Persistent bot-wide configuration that survives restarts';
COMMENT ON COLUMN bot_state.key IS 'Unique identifier for state entry (e.g., maintenance_mode, features_enabled)';
COMMENT ON COLUMN bot_state.value IS 'JSON value storing the state data';

-- Setup State Temporary Table (for multi-step personality setup)
CREATE TABLE IF NOT EXISTS setup_state_temp (
    context_id TEXT PRIMARY KEY,
    bot_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setup_state_temp_created_at ON setup_state_temp(created_at);

-- Comments
COMMENT ON TABLE setup_state_temp IS 'Temporary storage for multi-step personality setup (auto-cleaned after 24 hours)';

-- ============= MESSAGE STORAGE =============

-- Messages Table (stores all incoming and outgoing messages)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id TEXT UNIQUE NOT NULL, -- External message ID from provider
    context_id TEXT NOT NULL, -- Group ID or Telegram user ID
    context_type TEXT NOT NULL CHECK (context_type IN ('group', 'private')),
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    sender TEXT NOT NULL, -- Telegram user ID of message sender
    recipient TEXT, -- Telegram user ID of message recipient (for outgoing messages)
    content TEXT, -- Message text content
    media_url TEXT, -- URL to media (if message contains media)
    media_type TEXT, -- Type of media: 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact'
    media_content_type TEXT, -- MIME type of media
    media_size INTEGER, -- Size in bytes
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'queued', 'received')),
    error_message TEXT, -- Error message if status is 'failed'
    metadata JSONB DEFAULT '{}', -- Flexible storage for additional data (raw provider data, tool calls, etc.)

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Message classification (for AI/analytics)
    is_bot_command BOOLEAN DEFAULT FALSE,
    is_admin_command BOOLEAN DEFAULT FALSE,
    command_name TEXT, -- Name of command if this is a command message

    -- Soft delete (for compliance/GDPR)
    deleted_at TIMESTAMP WITH TIME ZONE,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Comments
COMMENT ON COLUMN messages.context_id IS 'Group ID or Telegram user ID';
COMMENT ON COLUMN messages.sender IS 'Telegram user ID of message sender';
COMMENT ON COLUMN messages.recipient IS 'Telegram user ID of message recipient';

-- ============= MESSAGE INDEXES (13 optimized indexes) =============

-- 1. Prevent duplicate messages from provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);

-- 2. MOST IMPORTANT: Conversation history queries (context_id + time-ordered)
CREATE INDEX IF NOT EXISTS idx_messages_context_created
    ON messages(context_id, created_at DESC)
    WHERE is_deleted = FALSE;

-- 3. User-specific queries
CREATE INDEX IF NOT EXISTS idx_messages_sender
    ON messages(sender, created_at DESC)
    WHERE is_deleted = FALSE;

-- 4. Time-based queries and analytics
CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at DESC);

-- 5. Monitoring failed messages (partial index)
CREATE INDEX IF NOT EXISTS idx_messages_failed
    ON messages(context_id, created_at DESC)
    WHERE status = 'failed' AND is_deleted = FALSE;

-- 6. Analytics: Message direction distribution
CREATE INDEX IF NOT EXISTS idx_messages_direction
    ON messages(direction, created_at DESC);

-- 7. Context type queries
CREATE INDEX IF NOT EXISTS idx_messages_context_type
    ON messages(context_type, created_at DESC)
    WHERE is_deleted = FALSE;

-- 8. Command tracking and analytics
CREATE INDEX IF NOT EXISTS idx_messages_commands
    ON messages(command_name, created_at DESC)
    WHERE is_bot_command = TRUE OR is_admin_command = TRUE;

-- 9. JSONB metadata queries (GIN index for flexible querying)
CREATE INDEX IF NOT EXISTS idx_messages_metadata
    ON messages USING GIN (metadata);

-- 10. Tool call optimization (for AI context)
CREATE INDEX IF NOT EXISTS idx_messages_tool_metadata
    ON messages USING GIN (metadata)
    WHERE metadata->>'tool_calls' IS NOT NULL;

-- 11. Quick "last tool call" lookups
CREATE INDEX IF NOT EXISTS idx_messages_last_tool
    ON messages (context_id, created_at DESC)
    WHERE metadata->>'tool_calls' IS NOT NULL;

-- 12. Media messages filtering
CREATE INDEX IF NOT EXISTS idx_messages_media
    ON messages(context_id, created_at DESC)
    WHERE media_url IS NOT NULL AND is_deleted = FALSE;

-- 13. Composite index for admin dashboards
CREATE INDEX IF NOT EXISTS idx_messages_context_direction_status
    ON messages(context_id, direction, status, created_at DESC)
    WHERE is_deleted = FALSE;

-- Comments on indexes
COMMENT ON INDEX idx_messages_tool_metadata IS 'Optimizes queries for messages containing tool call metadata (JSONB GIN index)';
COMMENT ON INDEX idx_messages_last_tool IS 'Optimizes lookups for most recent tool calls per conversation context';

-- ============= RAG (VECTOR EMBEDDINGS) =============

-- Conversation Embeddings (stores vector embeddings for semantic search)
CREATE TABLE IF NOT EXISTS conversation_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_id VARCHAR(255) NOT NULL,
    context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('group', 'private')),
    chunk_text TEXT NOT NULL,
    embedding vector(1536) NOT NULL, -- OpenAI text-embedding-3-small dimension
    message_ids TEXT[] NOT NULL, -- Array of message IDs included in this chunk
    chunk_index INTEGER NOT NULL, -- Sequence number of chunk in conversation
    timestamp_start TIMESTAMP WITH TIME ZONE NOT NULL, -- Start time of first message in chunk
    timestamp_end TIMESTAMP WITH TIME ZONE NOT NULL, -- End time of last message in chunk
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure chunk ordering is unique per context
    UNIQUE(context_id, chunk_index)
);

-- Indexes for conversation embeddings
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_context_id ON conversation_embeddings(context_id);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_timestamp_start ON conversation_embeddings(timestamp_start);
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_timestamp_end ON conversation_embeddings(timestamp_end);

-- HNSW index for fast vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_conv_embeddings_embedding_cosine ON conversation_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_conversation_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_embeddings_timestamp ON conversation_embeddings;
CREATE TRIGGER trigger_update_conversation_embeddings_timestamp
    BEFORE UPDATE ON conversation_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_embeddings_updated_at();

-- Statistics for query planner optimization
DROP STATISTICS IF EXISTS conv_embeddings_context_stats;
CREATE STATISTICS conv_embeddings_context_stats ON context_id, context_type FROM conversation_embeddings;

-- Comments
COMMENT ON TABLE conversation_embeddings IS 'Stores vector embeddings of conversation chunks for semantic search and RAG';
COMMENT ON COLUMN conversation_embeddings.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN conversation_embeddings.chunk_text IS 'Concatenated text of messages in this chunk';
COMMENT ON COLUMN conversation_embeddings.message_ids IS 'Array of message IDs from messages table';

-- ============= AUDIT & TRACKING =============

-- Tool Execution Audit (compliance and security auditing)
CREATE TABLE IF NOT EXISTS tool_execution_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Execution context
    tool_name VARCHAR(100) NOT NULL,
    tool_call_id VARCHAR(255),
    context_id VARCHAR(255) NOT NULL,

    -- User information
    user_telegram_id VARCHAR(255) NOT NULL,
    user_username VARCHAR(255),
    user_display_name VARCHAR(255),

    -- Execution details
    input_params JSONB NOT NULL DEFAULT '{}',
    output_result JSONB,
    execution_status VARCHAR(20) NOT NULL CHECK (execution_status IN ('success', 'error', 'timeout')),
    error_message TEXT,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for tool_execution_audit
CREATE INDEX IF NOT EXISTS idx_tool_audit_user_created
    ON tool_execution_audit(user_telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_audit_tool_created
    ON tool_execution_audit(tool_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_audit_context_created
    ON tool_execution_audit(context_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_audit_status_created
    ON tool_execution_audit(execution_status, created_at DESC)
    WHERE execution_status = 'error';

CREATE INDEX IF NOT EXISTS idx_tool_audit_created_at
    ON tool_execution_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_audit_user_tool
    ON tool_execution_audit(user_telegram_id, tool_name, created_at DESC);

-- Comments
COMMENT ON TABLE tool_execution_audit IS 'Audit log for all tool executions (ISP API, etc.) for compliance and security';
COMMENT ON COLUMN tool_execution_audit.tool_name IS 'Name of the tool executed (e.g., getUserInfo, checkAccountStatus)';
COMMENT ON COLUMN tool_execution_audit.tool_call_id IS 'Unique identifier for this tool call from AI SDK';
COMMENT ON COLUMN tool_execution_audit.duration_ms IS 'Execution time in milliseconds';

-- Telegram User Mapping (for webhook notifications)
CREATE TABLE IF NOT EXISTS telegram_user_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    telegram_id VARCHAR(50) NOT NULL,
    telegram_username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for telegram_user_mapping
CREATE INDEX IF NOT EXISTS idx_telegram_user_mapping_username ON telegram_user_mapping(username);
CREATE INDEX IF NOT EXISTS idx_telegram_user_mapping_telegram_id ON telegram_user_mapping(telegram_id);

-- Comments
COMMENT ON TABLE telegram_user_mapping IS 'Maps worker usernames to Telegram IDs for webhook notifications. Auto-populated from bot interactions.';
COMMENT ON COLUMN telegram_user_mapping.username IS 'Worker username from external system (e.g., josianeyoussef)';
COMMENT ON COLUMN telegram_user_mapping.telegram_id IS 'Telegram numeric user ID';

-- ============= SEED DATA =============

-- Insert default admin user (using numeric Telegram ID for security)
-- Use /getmyid command to find your Telegram ID
INSERT INTO whitelisted_users (user_identifier, whitelisted_by, notes)
VALUES ('341628148', 'system', 'Telegram admin user (Lamba)')
ON CONFLICT (user_identifier) DO NOTHING;

-- ============= FUTURE PARTITIONING NOTES =============
-- When we hit 10M+ messages, we can partition by:
-- 1. Time (monthly/yearly): CREATE TABLE messages_2025_01 PARTITION OF messages FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
-- 2. Context type: Separate tables for group vs private messages
-- The current indexes support both strategies

-- Record this migration
INSERT INTO migrations (name) VALUES ('001_init')
ON CONFLICT (name) DO NOTHING;
