import { createClient } from '@libsql/client';

async function main() {
  const client = createClient({ url: 'file:local.db' });
  await client.execute(`CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    role TEXT NOT NULL,
    max_discount_percent INTEGER DEFAULT 100,
    can_refund INTEGER DEFAULT 1,
    can_delete_sale INTEGER DEFAULT 1,
    can_void_order INTEGER DEFAULT 1,
    updated_at TEXT
  )`);
  console.log('role_permissions table created successfully');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
