# The Sabacc server image: the built site (classic + 3D pages) and the multiplayer
# server on one port. Node 24 runs the server's TypeScript directly.
#
#   ./scripts/docker-build.sh            # tags: <git sha> and latest (linux/amd64)
#   docker run -p 8080:8080 -v sabacc-data:/data sabacc
#
# See docs/DEPLOY.md.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
# The server needs only these: the rules engine, the wire protocol and itself.
COPY src/domain ./src/domain
COPY src/protocol ./src/protocol
COPY src/server ./src/server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "src/server/main.ts"]
