#!/bin/bash
set -e

npm install

# Skip DB setup if no database is configured.
if [ -z "$DATABASE_URL" ]; then
  echo "ℹ  DATABASE_URL not set — skipping database setup"
  exit 0
fi

# Apply the base schema if the database is empty (fresh import / new workspace).
# psql returns non-zero on error; we capture table count to detect an empty DB.
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d '[:space:]' || echo "0")

if [ "$TABLE_COUNT" = "0" ] || [ -z "$TABLE_COUNT" ]; then
  echo "→ Empty database detected — applying base schema…"
  if psql "$DATABASE_URL" -f migrations/0000_salty_shape.sql; then
    echo "✓ Base schema applied"
  else
    echo "⚠  Base schema failed — server will attempt recovery on startup"
  fi
fi

# Apply supplementary column/table migrations (idempotent).
echo "→ Running supplementary migrations…"
if npx tsx scripts/migrate.ts; then
  echo "✓ Migrations applied"
else
  echo "⚠  Migrations failed — schema may be out of sync. Run 'npm run db:migrate' manually."
  # Non-fatal: don't block the merge.
fi
