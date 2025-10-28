-- Migration: 010_add_tool_metadata_index
-- Purpose: Optimize queries for messages with tool call metadata
-- Date: 2025-10-14
-- Context: Enable context-aware conversational AI by indexing tool interactions

-- Index for messages with tool calls (speeds up tool history queries)
CREATE INDEX IF NOT EXISTS idx_messages_tool_metadata
ON messages USING GIN (metadata)
WHERE metadata->>'tool_calls' IS NOT NULL;

-- Index for quick "last tool call" lookups (ordered by time)
CREATE INDEX IF NOT EXISTS idx_messages_last_tool
ON messages (context_id, created_at DESC)
WHERE metadata->>'tool_calls' IS NOT NULL;

-- Comment for documentation
COMMENT ON INDEX idx_messages_tool_metadata IS 'Optimizes queries for messages containing tool call metadata (JSONB GIN index)';
COMMENT ON INDEX idx_messages_last_tool IS 'Optimizes lookups for most recent tool calls per conversation context';
