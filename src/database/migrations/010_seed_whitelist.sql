-- Migration: Seed Default Whitelist Numbers
-- This migration adds default phone numbers to the whitelist table
-- Idempotent: Can be run multiple times without issues (uses ON CONFLICT DO NOTHING)

-- Insert default whitelist users
INSERT INTO whitelisted_numbers (user_identifier, whitelisted_by, notes)
VALUES
    ('SOLamyy', 'system', 'Telegram admin user SOLamyy')
ON CONFLICT (user_identifier) DO NOTHING;

-- Record this migration
INSERT INTO migrations (name) VALUES ('010_seed_whitelist')
ON CONFLICT (name) DO NOTHING;
