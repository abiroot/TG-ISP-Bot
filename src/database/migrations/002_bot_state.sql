-- Migration: Add bot_state table for persistent bot configuration
-- This ensures bot state (maintenance mode, features) survives server restarts

CREATE TABLE IF NOT EXISTS bot_state (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bot_state_updated_at ON bot_state(updated_at);

-- Insert default values
INSERT INTO bot_state (key, value) VALUES
    ('maintenance_mode', '{"enabled": false, "message": null}'::jsonb),
    ('features_enabled', '{"ai_responses": true, "voice_transcription": true, "image_analysis": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Add comment
COMMENT ON TABLE bot_state IS 'Persistent bot-wide configuration that survives restarts';
COMMENT ON COLUMN bot_state.key IS 'Unique identifier for state entry (e.g., maintenance_mode, features_enabled)';
COMMENT ON COLUMN bot_state.value IS 'JSON value storing the state data';
COMMENT ON COLUMN bot_state.updated_at IS 'Last update timestamp';
