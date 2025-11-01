-- Drop all tables in production database
-- WARNING: This is IRREVERSIBLE and will delete ALL data

-- Drop tables in reverse dependency order to avoid foreign key constraint errors
DROP TABLE IF EXISTS conversation_embeddings CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS personalities CASCADE;
DROP TABLE IF EXISTS whitelisted_users CASCADE;
DROP TABLE IF EXISTS whitelisted_groups CASCADE;

-- Drop the pgvector extension if it exists
DROP EXTENSION IF EXISTS vector CASCADE;

-- Verify tables are dropped
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
