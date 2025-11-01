-- Migration: Customer Location Tracking
-- Purpose: Store ISP customer coordinates for money collectors
-- Created: 2025-11-01

-- Create customer_locations table
CREATE TABLE IF NOT EXISTS customer_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isp_username VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    updated_by_telegram_id VARCHAR(50) NOT NULL,
    updated_by_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create unique constraint for upsert pattern (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uk_customer_locations_username'
    ) THEN
        ALTER TABLE customer_locations
            ADD CONSTRAINT uk_customer_locations_username UNIQUE (isp_username);
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_locations_username
    ON customer_locations(isp_username);

CREATE INDEX IF NOT EXISTS idx_customer_locations_updated_by
    ON customer_locations(updated_by_telegram_id);

CREATE INDEX IF NOT EXISTS idx_customer_locations_updated_at
    ON customer_locations(updated_at DESC);

-- Create composite index for coordinate queries
CREATE INDEX IF NOT EXISTS idx_customer_locations_coords
    ON customer_locations(latitude, longitude);

-- Add comment for documentation
COMMENT ON TABLE customer_locations IS 'Stores ISP customer location coordinates updated by money collectors';
COMMENT ON COLUMN customer_locations.isp_username IS 'ISP system username (e.g., josianeyoussef)';
COMMENT ON COLUMN customer_locations.latitude IS 'Latitude coordinate (-90 to 90)';
COMMENT ON COLUMN customer_locations.longitude IS 'Longitude coordinate (-180 to 180)';
COMMENT ON COLUMN customer_locations.updated_by_telegram_id IS 'Telegram user ID who last updated this location';
COMMENT ON COLUMN customer_locations.updated_by_name IS 'Telegram user name for audit trail';
