-- Migration: Rename telegram_user_mapping columns for clarity
-- Purpose: Align column names with billing system terminology and reduce confusion
--
-- Changes:
-- - username → worker_username (represents worker username from billing system)
-- - telegram_username → telegram_handle (Telegram @username, optional)
-- - Add column comments explaining purpose
--
-- Backward Compatibility: All queries updated in same migration

-- Step 1: Rename columns
ALTER TABLE telegram_user_mapping
    RENAME COLUMN username TO worker_username;

ALTER TABLE telegram_user_mapping
    RENAME COLUMN telegram_username TO telegram_handle;

-- Step 2: Add column comments for documentation
COMMENT ON COLUMN telegram_user_mapping.worker_username IS
    'Worker username from billing system (derived from first_name, lowercase, no spaces). Used for webhook notifications.';

COMMENT ON COLUMN telegram_user_mapping.telegram_id IS
    'Telegram numeric user ID (permanent identifier). Primary lookup key for sending messages.';

COMMENT ON COLUMN telegram_user_mapping.telegram_handle IS
    'Telegram @username (optional, can change). Not used as primary identifier.';

COMMENT ON COLUMN telegram_user_mapping.first_name IS
    'User first name from Telegram profile. Source for deriving worker_username.';

COMMENT ON COLUMN telegram_user_mapping.last_name IS
    'User last name from Telegram profile (optional).';

COMMENT ON TABLE telegram_user_mapping IS
    'Maps worker usernames from billing system to Telegram user IDs for webhook notifications. Auto-populated from bot conversations.';

-- Step 3: Update indexes (drop old, create new with updated column names)
DROP INDEX IF EXISTS idx_telegram_user_mapping_username;
CREATE INDEX idx_telegram_user_mapping_worker_username ON telegram_user_mapping(worker_username);

-- Note: telegram_id index already exists and doesn't need renaming

-- Step 4: Verify unique constraint still applies to worker_username
-- (PostgreSQL automatically updates constraint references when column is renamed)
