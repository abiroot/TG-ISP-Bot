-- Migration 014: Telegram User Mapping Table
-- Purpose: Map worker usernames to Telegram IDs for webhook notifications
-- Auto-populated when users interact with the bot

CREATE TABLE IF NOT EXISTS telegram_user_mapping (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    telegram_id VARCHAR(50) NOT NULL,
    telegram_username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast username lookups (primary use case for webhook)
CREATE INDEX IF NOT EXISTS idx_telegram_user_mapping_username ON telegram_user_mapping(username);

-- Index for reverse lookups (telegram_id -> username)
CREATE INDEX IF NOT EXISTS idx_telegram_user_mapping_telegram_id ON telegram_user_mapping(telegram_id);

-- Comment the table
COMMENT ON TABLE telegram_user_mapping IS 'Maps worker usernames to Telegram IDs for webhook notifications. Auto-populated from bot interactions.';
COMMENT ON COLUMN telegram_user_mapping.username IS 'Worker username from external system (e.g., josianeyoussef)';
COMMENT ON COLUMN telegram_user_mapping.telegram_id IS 'Telegram numeric user ID';
COMMENT ON COLUMN telegram_user_mapping.telegram_username IS 'Telegram @username (optional)';
