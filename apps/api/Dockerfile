# RaghuMayaShop API (Express + Prisma) — monorepo-aware Dockerfile.
# Build context is the repo root (see docker-compose.yml: context: .).
# The same image serves both the `api` and the `worker` services.
#
# Fixes vs the old file:
# - COPY package-lock.json + .npmrc too: without the lockfile installs were
#   unpinned, and without .npmrc (legacy-peer-deps=true) npm could fail on
#   Expo's peer ranges.
# - REMOVED `npm prune --omit=dev`: prisma is a devDependency, and the
#   compose command runs `npx prisma migrate deploy` at container start —
#   after pruning, the prisma CLI was gone and the api could never start.
#   Dev deps stay in the image; correctness beats a smaller image here.

# ---------- build stage ----------
FROM node:20-alpine AS build
# Prisma needs the openssl CLI to detect which libssl the image has.
# Without it, Prisma defaults to the openssl-1.1.x engine, which Alpine
# cannot load — and `migrate deploy` then dies with "Could not parse
# schema engine response" (see also the runtime stage below). Install it
# BEFORE `prisma generate` so generate downloads the 3.0.x engines.
RUN apk add --no-cache openssl
WORKDIR /app

# install workspace deps (api + shared) — package files first for layer cache
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm install --workspace=@raghumaya/shared --workspace=raghumaya-api --no-audit --no-fund

# build shared, generate prisma client, build api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@raghumaya/shared
# Prisma CLI location depends on npm's hoisting: it may land in the root
# .bin or in the workspace .bin. Resolve it dynamically, but ALWAYS run it
# from /app — running it from apps/api fails with "Could not resolve
# @prisma/client" because the client is hoisted to the root node_modules.
RUN PRISMA_BIN="$(ls node_modules/.bin/prisma apps/api/node_modules/.bin/prisma 2>/dev/null | head -n 1)" \
 && "$PRISMA_BIN" generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=raghumaya-api

# ---------- runtime stage ----------
FROM node:20-alpine AS runtime
# Same openssl requirement as the build stage: `migrate deploy` (run by
# the entrypoint at container start) executes Prisma's schema engine, and
# the API's PrismaClient executes the query engine — both fail to load on
# Alpine without libssl. `apk add openssl` provides OpenSSL 3.x, which
# matches the 3.0.x engines `prisma generate` downloaded in the build.
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Whole workspace dirs, not hand-picked files: apps/api/node_modules holds
# nested copies npm created for version conflicts, and node needs them
# exactly as the build stage left them (same lesson as the web Dockerfile).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
# The seed service runs `npm run db:seed --workspace=raghumaya-api` from
# /app — npm needs the ROOT package.json (the workspaces field) to resolve
# that. Without it the seed dies with ENOENT on /app/package.json.
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /app/storage/invoices && chmod +x /app/apps/api/docker-entrypoint.sh
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
