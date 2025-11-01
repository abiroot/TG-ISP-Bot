-- Migration: Automated Cleanup for Temporary Data
-- This migration sets up scheduled cleanup for temporary tables
-- Uses pg_cron extension for scheduled tasks
-- Created: 2025-11-01

-- ============= ENABLE PG_CRON EXTENSION =============

-- Enable pg_cron for scheduled tasks (requires superuser or database owner)
-- Note: pg_cron must be installed on the PostgreSQL server
-- Installation: CREATE EXTENSION pg_cron;
-- If pg_cron is not available, the cleanup function can be called manually or via external cron

-- Attempt to create extension (may fail if not superuser, which is OK)
DO $$
BEGIN
    -- Try to create pg_cron extension
    CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'pg_cron extension requires superuser privileges. Skipping extension creation. Cleanup function will be available for manual execution.';
    WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron extension not available on this PostgreSQL installation. Cleanup function will be available for manual execution.';
END $$;

-- ============= CLEANUP FUNCTIONS =============

-- Function: cleanup_old_setup_states()
-- Purpose: Delete abandoned personality setup sessions older than 24 hours
-- This prevents the setup_state_temp table from growing indefinitely
CREATE OR REPLACE FUNCTION cleanup_old_setup_states() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM setup_state_temp WHERE created_at < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Log the cleanup action
    RAISE NOTICE 'Cleaned up % old setup state records', deleted_count;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION cleanup_old_setup_states() IS 'Deletes setup_state_temp records older than 24 hours. Returns count of deleted rows.';

-- ============= SCHEDULE CLEANUP JOBS (if pg_cron is available) =============

-- Schedule cleanup to run every 6 hours
-- Only schedule if pg_cron extension is available
DO $$
BEGIN
    -- Check if pg_cron extension exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove existing schedule if it exists
        PERFORM cron.unschedule('cleanup-old-setup-states');

        -- Schedule cleanup job every 6 hours
        PERFORM cron.schedule(
            'cleanup-old-setup-states',
            '0 */6 * * *',  -- Every 6 hours
            'SELECT cleanup_old_setup_states();'
        );

        RAISE NOTICE 'Scheduled cleanup job: cleanup-old-setup-states runs every 6 hours';
    ELSE
        RAISE NOTICE 'pg_cron not available. Manual execution required: SELECT cleanup_old_setup_states();';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not schedule cleanup job. You can run manually: SELECT cleanup_old_setup_states();';
END $$;

-- ============= ALTERNATIVE: TRIGGER-BASED CLEANUP =============

-- If pg_cron is not available, you can use a trigger-based approach
-- This trigger deletes old records whenever a new record is inserted
-- Uncomment the following if you prefer trigger-based cleanup:

/*
CREATE OR REPLACE FUNCTION trigger_cleanup_old_setup_states()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete old records (older than 24 hours) whenever a new record is inserted
    DELETE FROM setup_state_temp WHERE created_at < NOW() - INTERVAL '24 hours';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_setup_state_on_insert ON setup_state_temp;
CREATE TRIGGER trigger_cleanup_setup_state_on_insert
    AFTER INSERT ON setup_state_temp
    FOR EACH STATEMENT
    EXECUTE FUNCTION trigger_cleanup_old_setup_states();

COMMENT ON FUNCTION trigger_cleanup_old_setup_states() IS 'Auto-cleanup trigger: deletes old setup_state_temp records on every insert';
*/

-- ============= MANUAL CLEANUP INSTRUCTIONS =============

-- To manually run cleanup:
--   SELECT cleanup_old_setup_states();

-- To check scheduled jobs (if pg_cron is available):
--   SELECT * FROM cron.job WHERE jobname = 'cleanup-old-setup-states';

-- To unschedule a job (if pg_cron is available):
--   SELECT cron.unschedule('cleanup-old-setup-states');

-- Record this migration
INSERT INTO migrations (name) VALUES ('002_cleanup_function')
ON CONFLICT (name) DO NOTHING;
