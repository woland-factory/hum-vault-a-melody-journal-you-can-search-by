#!/usr/bin/env bash
set -euo pipefail
# PW_VERSION MUST equal the @playwright/test version npm ci installs (pinned
# EXACT in package.json). Bump both in lockstep, or the container's bundled
# browsers stop matching and launches fail with "Executable doesn't exist".
PW_VERSION="1.61.1"
# Run-scoped webServer port so concurrent runs on a shared host do not collide.
E2E_PORT="${E2E_PORT:-$((3100 + RANDOM % 800))}"
cd "$(dirname "$0")/.."
# This app is client-only: no database, so no db step and no DATABASE_URL.
# --network host lets Playwright's webServer (the production build) bind on
# 127.0.0.1. --user runs as the host user so npm ci leaves no root-owned files.
docker run --rm --init --ipc=host --network host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  -e CI=1 -e E2E_PORT="$E2E_PORT" -v "$PWD":/work -w /work \
  "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  sh -c 'npm ci && npm run test:e2e'
