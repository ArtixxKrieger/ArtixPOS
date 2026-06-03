-- MikroTik router integration settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS mikrotik_enabled INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mikrotik_host TEXT,
  ADD COLUMN IF NOT EXISTS mikrotik_port TEXT DEFAULT '80',
  ADD COLUMN IF NOT EXISTS mikrotik_user TEXT DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS mikrotik_password TEXT,
  ADD COLUMN IF NOT EXISTS mikrotik_hotspot_profile TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS mikrotik_use_ssl INTEGER DEFAULT 0;

-- Track which MikroTik hotspot user ID was created for each voucher
ALTER TABLE wifi_vouchers
  ADD COLUMN IF NOT EXISTS mikrotik_user_id TEXT;
