# Build context: Backend/; this image starts only the existing administration main.
FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN test "$(npm --version)" = "10.9.4" && npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts
COPY services/administration/tsconfig.build.json ./services/administration/tsconfig.build.json
COPY services/administration/src ./services/administration/src
RUN npm run build:administration

FROM build AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runtime
LABEL io.primax.service="administration"
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/services/administration/dist ./services/administration/dist
COPY package*.json ./
USER node
EXPOSE 3000
CMD ["node", "services/administration/dist/src/apps/administration/main.js"]
