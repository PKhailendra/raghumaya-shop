# RaghuMayaShop web dashboard (Next.js 15) — monorepo-aware Dockerfile.
#
# BUILD CONTEXT IS THE REPO ROOT (see docker-compose.yml: context: .).
# The old file used context ./apps/web and did `COPY package.json
# package-lock.json ./`, but package-lock.json lives at the repo root, so
# the build failed with: `"/package-lock.json": not found`.
# The web app is also an npm workspace that depends on @raghumaya/shared,
# so the install and the build must both run from the root.
#
# Stages: deps -> builder -> runner (production `next start`).

# ---------- deps: install only the shared + web workspaces ----------
FROM node:20-alpine AS deps
WORKDIR /app
# .npmrc sets legacy-peer-deps=true (Expo peer ranges); without it npm
# install can fail on peer conflicts. package-lock.json pins versions.
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm install --workspace=@raghumaya/shared --workspace=raghumaya-web --no-audit --no-fund

# ---------- builder: build shared, then the Next.js app ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json /app/.npmrc ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# NEXT_PUBLIC_* values are inlined into the JS bundle AT BUILD TIME, so
# they must arrive as a build arg (compose passes NEXT_PUBLIC_API_URL).
# A runtime-only env var would have no effect on the built app.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@raghumaya/shared
RUN npm run build --workspace=raghumaya-web

# ---------- runner: production server ----------
FROM node:20-alpine AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared /app/packages/shared
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/next.config.mjs ./next.config.mjs
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next ./.next
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q -O /dev/null http://localhost:3000/login || exit 1
CMD ["npm", "start"]
