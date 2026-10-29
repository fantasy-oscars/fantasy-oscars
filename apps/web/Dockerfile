# Web image: the built SPA behind Caddy (TLS, /api proxy). Build from the repository root:
#   docker build -f apps/web/Dockerfile -t fantasy-oscars-web .
# The build context is filtered by apps/web/Dockerfile.dockerignore.

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter @fantasy-oscars/web... --filter '!fantasy-oscars'

COPY packages/shared packages/shared
COPY apps/web apps/web
# Same-origin mode: the browser calls /api/* on the site's own host.
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
RUN pnpm --filter @fantasy-oscars/shared build \
 && pnpm --filter @fantasy-oscars/web build

FROM caddy:2.11.7-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/fantasy-oscars/fantasy-oscars"
COPY --from=build /repo/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY infra/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV SITE_HOST=localhost
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:2019/config/"]
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
