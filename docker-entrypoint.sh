#!/bin/sh
set -e

echo "[entrypoint] Applying database schema..."
node_modules/.bin/drizzle-kit push --force || {
  echo "[entrypoint] WARNING: schema push failed — continuing anyway"
}
echo "[entrypoint] Starting server..."
exec node dist/cluster.cjs
