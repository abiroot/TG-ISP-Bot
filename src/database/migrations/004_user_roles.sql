-- Migration 004: User Roles (RBAC)
-- Description: Database-backed role-based access control for ISP tools
-- Date: 2025-01-02
-- Author: Claude Code

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Role Assignments Table
-- Stores persistent role assignments for admin, collector, and worker roles
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User identification
    user_telegram_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'collector', 'worker')),

    -- Audit trail
    assigned_by VARCHAR(255) NOT NULL,  -- Telegram ID of admin who assigned role
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,

    -- Soft delete for audit history
    is_active BOOLEAN DEFAULT TRUE,
    revoked_by VARCHAR(255),
    revoked_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Prevent duplicate active role assignments
    -- Same user can have multiple roles, but each role only once
    UNIQUE(user_telegram_id, role)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_telegram_id
    ON user_roles(user_telegram_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_roles_role
    ON user_roles(role)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_at
    ON user_roles(assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_active
    ON user_roles(is_active, user_telegram_id, role);

-- Trigger for automatic updated_at timestamp
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles CASCADE;
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Table comments (documentation)
COMMENT ON TABLE user_roles IS
    'Role-based access control (RBAC) assignments for ISP tools. Persists across bot restarts.';

COMMENT ON COLUMN user_roles.user_telegram_id IS
    'Telegram numeric user ID (e.g., "123456789"). Same format as ADMIN_IDS config.';

COMMENT ON COLUMN user_roles.role IS
    'Role name: admin (full access), collector (location updates), worker (location updates)';

COMMENT ON COLUMN user_roles.assigned_by IS
    'Telegram ID of admin who assigned this role. "system" for auto-migrated roles.';

COMMENT ON COLUMN user_roles.is_active IS
    'FALSE = role revoked (soft delete). Preserves audit trail.';

COMMENT ON COLUMN user_roles.revoked_by IS
    'Telegram ID of admin who revoked this role. NULL if still active.';

COMMENT ON COLUMN user_roles.revoked_at IS
    'Timestamp when role was revoked. NULL if still active.';

-- Insert migration record
INSERT INTO migrations (name, applied_at)
VALUES ('004_user_roles', NOW())
ON CONFLICT (name) DO NOTHING;
