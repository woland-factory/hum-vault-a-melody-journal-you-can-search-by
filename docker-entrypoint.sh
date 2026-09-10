#!/bin/sh
# Runs before nginx starts (via /docker-entrypoint.d). Writes env.js from the
# environment so runtime config is never baked into the bundle. Unset values
# become empty strings. These are client-side identifiers, not secrets.
set -eu

TARGET="/usr/share/nginx/html/env.js"

escape() {
  # Escape backslashes and double quotes for safe embedding in a JS string.
  printf '%s' "${1:-}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

cat > "$TARGET" <<EOF
window.__HUMVAULT_ENV__ = {
  SENTRY_DSN: "$(escape "${SENTRY_DSN:-}")",
  UMAMI_WEBSITE_ID: "$(escape "${UMAMI_WEBSITE_ID:-}")",
  UMAMI_URL: "$(escape "${UMAMI_URL:-}")"
};
EOF

echo "humvault: wrote runtime env to $TARGET"
