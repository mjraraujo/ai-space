# AI Space — Backend API Server
FROM node:22-alpine

# Non-root user for security
RUN addgroup -S aispace && adduser -S -G aispace aispace

WORKDIR /app

COPY package.json ./
# No external deps — pure Node.js ESM server

COPY . .

# Create data directory for KV cache
RUN mkdir -p /data/kv-cache && chown -R aispace:aispace /data /app

USER aispace

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
