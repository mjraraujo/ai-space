# ── Stage 1: Build the SPA ────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────────
FROM nginx:alpine

# Inject the server URL into the SPA's index.html at container start-time.
# When SERVER_URL is set (e.g. http://localhost:8080), a <script> tag is
# inserted that sets window.__SERVER_URL__ so the SPA can discover the backend.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint script patches index.html with the runtime SERVER_URL env variable.
COPY docker-entrypoint.sh /docker-entrypoint.d/50-inject-server-url.sh
RUN chmod +x /docker-entrypoint.d/50-inject-server-url.sh

EXPOSE 8080
