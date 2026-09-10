#!/usr/bin/env bash
# Builds the production image, serves it, and proves the deploy scaffold:
#   - /healthz returns 200
#   - env.js is generated from the container environment at start
#   - no runtime value is baked into the hashed app bundle
# Tears everything down at the end. Runs entirely in the foreground.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="humvault-staging-check:$$"
CONTAINER="humvault-staging-check-$$"
PORT="${CHECK_PORT:-$((8000 + RANDOM % 1000))}"
TEST_DSN="https://checkdsn.example/42"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker rmi "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Validating staging compose syntax"
docker compose -f docker-compose.staging.yml config >/dev/null

echo "==> Building image"
docker build -t "$IMAGE" .

echo "==> Starting container on 127.0.0.1:$PORT"
docker run -d --name "$CONTAINER" \
  -e SENTRY_DSN="$TEST_DSN" \
  -p "127.0.0.1:$PORT:80" "$IMAGE" >/dev/null

echo "==> Waiting for /healthz"
ok=""
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  echo "FAIL: /healthz never came up"
  docker logs "$CONTAINER" || true
  exit 1
fi

code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/healthz")
[ "$code" = "200" ] || { echo "FAIL: /healthz returned $code"; exit 1; }
echo "    /healthz -> 200"

echo "==> Checking env.js is generated from the environment"
envjs=$(curl -fsS "http://127.0.0.1:$PORT/env.js")
echo "$envjs" | grep -q "checkdsn.example" || {
  echo "FAIL: env.js was not generated from the container environment"
  echo "$envjs"
  exit 1
}
echo "    env.js carries the runtime SENTRY_DSN"

echo "==> Checking no runtime value leaked into the app bundle"
asset=$(curl -fsS "http://127.0.0.1:$PORT/index.html" | grep -oE '/assets/[^"]+\.js' | head -1)
bundle=$(curl -fsS "http://127.0.0.1:$PORT$asset")
if printf '%s' "$bundle" | grep -q "checkdsn.example"; then
  echo "FAIL: runtime value found inside the built bundle"
  exit 1
fi
echo "    no runtime secret literal in the bundle"

echo "==> Staging check passed"
