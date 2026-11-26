#!/bin/sh
# RaghuMayaShop API entrypoint: apply Prisma migrations, then run the
# command given as arguments (api server, seed, ...).
#
# Runs from /app (the repo root inside the container). The prisma CLI must
# run from here — running it from apps/api fails with "Could not resolve
# @prisma/client", because the client is hoisted to the root node_modules.
# The CLI binary itself may live in the root .bin or the workspace .bin
# (depends on npm's hoisting), so resolve it dynamically.
#
# Kept as a script file (instead of an inline `sh -c` in compose) because
# Compose interpolates `$VAR` in command strings — an inline
# `$(...)` / `"$PRISMA_BIN"` would be eaten and replaced with an empty
# string before the container ever sees it.
set -e
PRISMA_BIN="$(ls node_modules/.bin/prisma apps/api/node_modules/.bin/prisma 2>/dev/null | head -n 1)"
if [ -z "$PRISMA_BIN" ]; then
  echo "docker-entrypoint: prisma CLI not found in node_modules/.bin or apps/api/node_modules/.bin" >&2
  exit 1
fi
"$PRISMA_BIN" migrate deploy --schema=apps/api/prisma/schema.prisma
exec "$@"
