-- Migration: Replace MikroTik-only columns with universal router_config JSONB
-- Run AFTER this migration: you can optionally drop the old columns

BEGIN;

-- 1. Add the new router_config column
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS router_config JSONB;

-- 2. Migrate existing MikroTik configurations into the new JSONB column
-- Only run if the old columns exist (safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='mikrotik_enabled') THEN
    UPDATE user_settings
    SET router_config = jsonb_build_object(
      'type', 'mikrotik',
      'enabled', CASE WHEN mikrotik_enabled = 1 THEN true ELSE false END,
      'host', mikrotik_host,
      'port', COALESCE(mikrotik_port, '80'),
      'username', COALESCE(mikrotik_user, 'admin'),
      'password', COALESCE(mikrotik_password, ''),
      'useSsl', CASE WHEN mikrotik_use_ssl = 1 THEN true ELSE false END,
      'hotspotProfile', COALESCE(mikrotik_hotspot_profile, 'default')
    )
    WHERE router_config IS NULL
      AND mikrotik_host IS NOT NULL
      AND mikrotik_host != '';
  END IF;
END $$;

COMMIT;

-- After migration is verified in production, run these statements in a
-- separate migration to clean up the deprecated columns:
--
--   ALTER TABLE user_settings DROP COLUMN mikrotik_enabled;
--   ALTER TABLE user_settings DROP COLUMN mikrotik_host;
--   ALTER TABLE user_settings DROP COLUMN mikrotik_port;
--   ALTER TABLE user_settings DROP COLUMN mikrotik_user;
--   ALTER TABLE user_settings DROP COLUMN mikrotik_password;
--   ALTER TABLE user_settings DROP COLUMN mikrotik_hotspot_profile;
--   ALTER TABLE user_settings DROP COLUMN mikrotik_use_ssl;
