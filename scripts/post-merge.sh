#!/bin/bash
set -e

npm install

# Skip schema push if no database is configured (e.g. Replit dev without a DB).
if [ -z "$DATABASE_URL" ]; then
  echo "ℹ  DATABASE_URL not set — skipping db:push"
  exit 0
fi

echo "→ Running db:push…"
if npm run db:push; then
  echo "✓ db:push succeeded"
else
  echo "⚠  db:push failed — schema may be out of sync. Run 'npm run db:push' manually."
  # Non-fatal: don't block the merge over a schema drift warning.
  exit 0
fi
