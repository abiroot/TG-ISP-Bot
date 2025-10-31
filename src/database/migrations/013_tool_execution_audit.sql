-- Migration: Tool Execution Audit Log
-- Purpose: Track all tool executions for compliance and security auditing
-- Date: 2025-01-29

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
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying by user (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_tool_audit_user_created
ON tool_execution_audit(user_telegram_id, created_at DESC);

-- Index for querying by tool name
CREATE INDEX IF NOT EXISTS idx_tool_audit_tool_created
ON tool_execution_audit(tool_name, created_at DESC);

-- Index for querying by context (conversation tracking)
CREATE INDEX IF NOT EXISTS idx_tool_audit_context_created
ON tool_execution_audit(context_id, created_at DESC);

-- Index for querying by status (error monitoring)
CREATE INDEX IF NOT EXISTS idx_tool_audit_status_created
ON tool_execution_audit(execution_status, created_at DESC)
WHERE execution_status = 'error';

-- Index for time-based queries (analytics)
CREATE INDEX IF NOT EXISTS idx_tool_audit_created_at
ON tool_execution_audit(created_at DESC);

-- Composite index for user + tool queries
CREATE INDEX IF NOT EXISTS idx_tool_audit_user_tool
ON tool_execution_audit(user_telegram_id, tool_name, created_at DESC);

COMMENT ON TABLE tool_execution_audit IS 'Audit log for all tool executions (ISP API, etc.) for compliance and security';
COMMENT ON COLUMN tool_execution_audit.tool_name IS 'Name of the tool executed (e.g., getUserInfo, checkAccountStatus)';
COMMENT ON COLUMN tool_execution_audit.tool_call_id IS 'Unique identifier for this tool call from AI SDK';
COMMENT ON COLUMN tool_execution_audit.input_params IS 'Input parameters passed to the tool (JSONB for flexibility)';
COMMENT ON COLUMN tool_execution_audit.output_result IS 'Result returned by the tool (JSONB)';
COMMENT ON COLUMN tool_execution_audit.execution_status IS 'Status of execution: success, error, or timeout';
COMMENT ON COLUMN tool_execution_audit.duration_ms IS 'Execution time in milliseconds';
COMMENT ON COLUMN tool_execution_audit.metadata IS 'Additional metadata (IP address, user agent, etc.)';
