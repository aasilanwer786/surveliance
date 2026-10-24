#!/bin/sh
set -e

echo "[entrypoint] applying database migrations..."
prisma migrate deploy

if [ "$SEED_DEMO" = "true" ]; then
  echo "[entrypoint] seeding demo data (SEED_DEMO=true)..."
  tsx prisma/seed.ts
fi

echo "[entrypoint] starting API on ${HOST:-0.0.0.0}:${PORT:-4000}"
exec node dist/server.js
