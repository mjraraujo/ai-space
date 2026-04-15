#!/bin/sh
# docker-entrypoint.sh — Inject runtime configuration into index.html.
#
# Supported environment variables:
#   SERVER_URL       — URL at which the ai-server API is reachable from the
#                      browser (e.g. https://my-vps.example.com).
#   PERSONAPLEX_URL  — URL the browser should use to reach the PersonaPlex
#                      server.  May be:
#                        • An absolute URL: https://my-vps.example.com
#                          (direct connection to PersonaPlex; requires port
#                          8998 to be open and SSL accepted by the browser)
#                        • A path:  /ws/voice
#                          (routes through the nginx WebSocket proxy; works
#                          out-of-the-box with the bundled docker-compose)
#                      Leave unset to let users configure it in Settings.

set -e

INDEX="/usr/share/nginx/html/index.html"

# ── SERVER_URL ────────────────────────────────────────────────────────────────
if [ -n "${SERVER_URL}" ] && [ -f "${INDEX}" ]; then
  # Validate that SERVER_URL looks like a reasonable URL (http/https + hostname).
  case "${SERVER_URL}" in
    http://*|https://*)
      ;;
    *)
      echo "[entrypoint] SERVER_URL must start with http:// or https://, ignoring: ${SERVER_URL}"
      exit 0
      ;;
  esac

  # Sanitize: remove any single quotes and HTML special chars from SERVER_URL
  # to prevent script-injection in the generated <script> tag.
  SAFE_URL=$(printf '%s' "${SERVER_URL}" | tr -d "\"'<>&")

  SNIPPET="<script>window.__SERVER_URL__='${SAFE_URL}';</script>"

  # Insert snippet right before </head> if not already injected
  if ! grep -q '__SERVER_URL__' "${INDEX}"; then
    sed -i "s|</head>|${SNIPPET}</head>|" "${INDEX}"
    echo "[entrypoint] Injected SERVER_URL into index.html"
  fi
else
  echo "[entrypoint] SERVER_URL not set — running in browser-only mode"
fi

# ── PERSONAPLEX_URL ───────────────────────────────────────────────────────────
if [ -n "${PERSONAPLEX_URL}" ] && [ -f "${INDEX}" ]; then
  # Accept absolute http(s) URLs or root-relative paths.
  case "${PERSONAPLEX_URL}" in
    http://*|https://*|/*)
      ;;
    *)
      echo "[entrypoint] PERSONAPLEX_URL must be an http/https URL or a root-relative path (e.g. /ws/voice), ignoring: ${PERSONAPLEX_URL}"
      PERSONAPLEX_URL=""
      ;;
  esac

  if [ -n "${PERSONAPLEX_URL}" ]; then
    SAFE_PX_URL=$(printf '%s' "${PERSONAPLEX_URL}" | tr -d "\"'<>&")
    PX_SNIPPET="<script>window.__PERSONAPLEX_URL__='${SAFE_PX_URL}';</script>"

    if ! grep -q '__PERSONAPLEX_URL__' "${INDEX}"; then
      sed -i "s|</head>|${PX_SNIPPET}</head>|" "${INDEX}"
      echo "[entrypoint] Injected PERSONAPLEX_URL into index.html"
    fi
  fi
fi
