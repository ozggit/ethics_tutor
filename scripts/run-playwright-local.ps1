$ErrorActionPreference = "Stop"

# Runs Playwright against an already-running server (default: http://localhost:3000).
# This script is for environments where the repo can install Playwright.

if (-not $env:PLAYWRIGHT_BASE_URL) {
  $env:PLAYWRIGHT_BASE_URL = "http://localhost:3000"
}

$env:E2E_LOCAL = "1"

New-Item -ItemType Directory -Force -Path "playwright-artifacts" | Out-Null

npx playwright test
