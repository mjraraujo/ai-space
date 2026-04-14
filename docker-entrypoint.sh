#!/bin/sh
# docker-entrypoint.sh — Inject window.__SERVER_URL__ into index.html at start-time.
#
# The SERVER_URL environment variable is set by docker-compose to the URL at
# which the ai-server container is reachable from the browser (e.g. the
# public hostname/port of the Docker host, defaulting to empty string so the
# SPA falls back to its browser-native path on GitHub Pages).

set -e

INDEX="/usr/share/nginx/html/index.html"

if [ -n "${SERVER_URL}" ] && [ -f "${INDEX}" ]; then
  SNIPPET="<script>window.__SERVER_URL__='${SERVER_URL}';</script>"
  # Insert snippet right before </head> if not already injected
  if ! grep -q '__SERVER_URL__' "${INDEX}"; then
    sed -i "s|</head>|${SNIPPET}</head>|" "${INDEX}"
    echo "[entrypoint] Injected SERVER_URL=${SERVER_URL} into index.html"
  fi
else
  echo "[entrypoint] SERVER_URL not set — running in browser-only mode"
fi
