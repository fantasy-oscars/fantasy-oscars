# Build from the repository root: docker build -f apps/api/Dockerfile -t fantasy-oscars-api .
# (or `pnpm run docker:build:api`).

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Dependency layer: manifests only, so source edits don't bust the install cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter @fantasy-oscars/api... --filter '!fantasy-oscars'

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @fantasy-oscars/shared build \
 && pnpm --filter @fantasy-oscars/api build \
 && pnpm --filter @fantasy-oscars/api deploy --prod /out \
 && rm -rf /out/dist && cp -r apps/api/dist /out/dist

FROM node:24-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/fantasy-oscars/fantasy-oscars"
ENV NODE_ENV=production \
    PORT=4000 \
    MIGRATIONS_DIR=/app/database/migrations
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --chown=node:node database/migrations ./database/migrations
USER node
EXPOSE 4000
# Liveness only (no DB) so the probe doesn't keep a suspend-on-idle database awake.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Same start path as Render: optional migrate-on-start (MIGRATE_ON_START), then the API.
CMD ["node", "scripts/start.mjs"]
