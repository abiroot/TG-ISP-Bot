-- Create user_identifiers table to map Telegram user IDs to usernames
-- This enables username whitelisting by maintaining mappings between numeric IDs and usernames

CREATE TABLE IF NOT EXISTS user_identifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id TEXT UNIQUE NOT NULL, -- Numeric ID from ctx.from
    username TEXT UNIQUE, -- @username without @ symbol
    first_name TEXT,
    last_name TEXT,
    display_name TEXT, -- From ctx.name
    push_name TEXT, -- From ctx.pushName
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_identifiers_telegram_id ON user_identifiers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_user_identifiers_username ON user_identifiers(username);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_identifiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS update_user_identifiers_updated_at_trigger ON user_identifiers;

CREATE TRIGGER update_user_identifiers_updated_at_trigger
    BEFORE UPDATE ON user_identifiers
    FOR EACH ROW
    EXECUTE FUNCTION update_user_identifiers_updated_at();

-- Add comments for documentation
COMMENT ON TABLE user_identifiers IS 'Maps Telegram user IDs to usernames for username whitelisting support';
COMMENT ON COLUMN user_identifiers.telegram_id IS 'Numeric Telegram user ID from ctx.from';
COMMENT ON COLUMN user_identifiers.username IS 'Telegram username without @ symbol';
COMMENT ON COLUMN user_identifiers.first_name IS 'User first name from Telegram profile';
COMMENT ON COLUMN user_identifiers.last_name IS 'User last name from Telegram profile';
COMMENT ON COLUMN user_identifiers.display_name IS 'Display name from ctx.name';
COMMENT ON COLUMN user_identifiers.push_name IS 'Push name from ctx.pushName';