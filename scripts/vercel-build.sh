#!/usr/bin/env sh
# Vercel build: apply migrations and idempotent seed when a database is attached
# (the Neon integration sets DATABASE_URL per environment, and a Neon branch per
# preview), then build the app. Without a database the app still builds.
set -e
if [ -n "$DATABASE_URL" ]; then
  pnpm db:migrate
  pnpm db:seed
else
  echo "DATABASE_URL not set; skipping migrations and seed"
fi
pnpm next build
