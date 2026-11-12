FROM node:22-alpine

LABEL org.opencontainers.image.title="marquee"
LABEL org.opencontainers.image.description="Self-hosted media-hub dashboard for Plex/Jellyfin + Seerr and friends"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server ./server
COPY frontend ./frontend
COPY config/default-settings.json ./config/default-settings.json

RUN mkdir -p /config && chown -R node:node /app /config

VOLUME ["/config"]
USER node

ENV NODE_ENV=production \
    PORT=8080 \
    MARQUEE_CONFIG_DIR=/config

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server/index.js"]
