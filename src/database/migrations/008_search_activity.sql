-- Migration: Customer Search Activity Tracking
-- Purpose: Track ISP customer searches by workers/collectors for admin oversight
-- Created: 2025-12-28

-- Create customer_search_activity table
CREATE TABLE IF NOT EXISTS customer_search_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who performed the search
    user_telegram_id VARCHAR(255) NOT NULL,
    worker_username VARCHAR(255),
    user_display_name VARCHAR(255),

    -- Search details
    search_identifier VARCHAR(255) NOT NULL,
    identifier_type VARCHAR(20) NOT NULL DEFAULT 'phone', -- 'phone' | 'username'

    -- Results
    results_count INTEGER DEFAULT 0,
    search_successful BOOLEAN DEFAULT false,
    customer_usernames TEXT[], -- ISP usernames from results for reference

    -- Timing
    response_time_ms INTEGER,

    -- Metadata
    context_type VARCHAR(50) DEFAULT 'private', -- 'private' | 'group'
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_search_activity_user_created
    ON customer_search_activity(user_telegram_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_activity_worker_created
    ON customer_search_activity(worker_username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_activity_identifier
    ON customer_search_activity(search_identifier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_activity_created
    ON customer_search_activity(created_at DESC);

-- Index for date range queries (last 7 days report)
CREATE INDEX IF NOT EXISTS idx_search_activity_date
    ON customer_search_activity(created_at);

-- Add comments for documentation
COMMENT ON TABLE customer_search_activity IS 'Tracks ISP customer searches by workers/collectors for admin oversight';
COMMENT ON COLUMN customer_search_activity.user_telegram_id IS 'Telegram user ID who performed the search';
COMMENT ON COLUMN customer_search_activity.worker_username IS 'Worker username from telegram_user_mapping';
COMMENT ON COLUMN customer_search_activity.search_identifier IS 'Phone number or username searched';
COMMENT ON COLUMN customer_search_activity.identifier_type IS 'Type of identifier: phone or username';
COMMENT ON COLUMN customer_search_activity.results_count IS 'Number of customers found';
COMMENT ON COLUMN customer_search_activity.customer_usernames IS 'Array of ISP usernames found in search results';
COMMENT ON COLUMN customer_search_activity.response_time_ms IS 'Search API response time in milliseconds';
