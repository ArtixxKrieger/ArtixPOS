#!/bin/sh
# Railway / container startup script
# Runs DB migrations (safe — uses IF NOT EXISTS), then starts the app

echo "[railway] Pushing DB schema (safe — uses IF NOT EXISTS)..."
npx drizzle-kit push 2>&1 || echo "[railway] ⚠ drizzle-kit push skipped (may need DATABASE_URL)"

echo "[railway] Starting ArtixPOS..."
exec node dist/index.cjs
