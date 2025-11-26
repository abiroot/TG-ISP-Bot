-- Migration 007: Add index on telegram_handle for lookup optimization
-- Purpose: Support fallback lookup strategy by telegram_handle in /api/send-message

-- Create partial index (only index non-null values for efficiency)
CREATE INDEX IF NOT EXISTS idx_telegram_user_mapping_telegram_handle
ON telegram_user_mapping(telegram_handle)
WHERE telegram_handle IS NOT NULL;

-- Record migration
INSERT INTO migrations (name) VALUES ('007_add_telegram_handle_index')
ON CONFLICT (name) DO NOTHING;
