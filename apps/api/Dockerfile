# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# install workspace deps (api + shared)
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install --workspace=@raghumaya/shared --workspace=raghumaya-api --no-audit --no-fund

# build shared, generate prisma client, build api
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@raghumaya/shared
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace=raghumaya-api
RUN npm prune --omit=dev --workspace=raghumaya-api

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
CMD ["node", "apps/api/dist/server.js"]
