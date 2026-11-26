# RaghuMayaShop web dashboard (Next.js 15) — monorepo-aware Dockerfile.
#
# BUILD CONTEXT IS THE REPO ROOT (see docker-compose.yml: context: .).
# The web app is an npm workspace that depends on @raghumaya/shared, so
# the install and the build must both run from the root.
#
# Stages: builder -> runner (production `next start`).
#
# Install and build happen in the SAME stage on purpose. The previous
# version installed in a `deps` stage and copied only /app/node_modules
# into the builder — but npm nests a second copy of a package under a
# workspace's own node_modules when two workspaces need different
# versions (here: typescript 5.5.4 for @raghumaya/shared vs 5.6.3 for
# the web app). Copying only the root node_modules dropped those nested
# copies, and the shared build died with `sh: tsc: not found`. The
# runner below copies whole workspace dirs for the same reason — never
# copy a partial node_modules tree across stages.

# ---------- builder: install, build shared, build the Next.js app ----------
FROM node:20-alpine AS builder
WORKDIR /app
# .npmrc sets legacy-peer-deps=true (Expo peer ranges); without it npm
# install can fail on peer conflicts. package-lock.json pins versions.
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm install --workspace=@raghumaya/shared --workspace=raghumaya-web --no-audit --no-fund
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
# Whole workspace dirs, not hand-picked files: apps/web/node_modules and
# packages/shared/node_modules hold nested copies npm created for version
# conflicts, and `next start` needs them exactly as the builder left them.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared /app/packages/shared
COPY --from=builder /app/apps/web /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q -O /dev/null http://localhost:3000/login || exit 1
CMD ["npm", "start"]
