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
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

RUN mkdir -p /app/storage/invoices
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
