#!/usr/bin/env bash
set -euo pipefail

# Runs Playwright against an already-running server (default: http://localhost:3000).
# This script is for environments where the repo can install Playwright.

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
export E2E_LOCAL=1

mkdir -p playwright-artifacts

npx playwright test
