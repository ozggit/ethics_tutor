# Agent Notes

## Webfetch Docs Issue + Curl Fix

Problem: When pulling vendor documentation via `webfetch`, responses can be unreliable for debugging:

- Some pages return heavily processed/converted output (or truncated output) that drops key details like request JSON field names.
- Some pages (or redirects) return empty/blocked content depending on upstream headers.
- Large pages can be summarized in ways that omit the exact snippets we need (e.g., the exact REST payload shape).

Fix: Use `curl` to fetch the raw text/HTML directly and inspect it locally.

Example:

```bash
# Fetch raw page text (follow redirects)
curl -L "https://ai.google.dev/gemini-api/docs/file-search" -o /tmp/file-search.html

# If the site provides a .txt variant, prefer it for diff/grep
curl -L "https://ai.google.dev/gemini-api/docs/file-search.md.txt" -o /tmp/file-search.md.txt

# Then search locally for exact fields
rg "file_search_store_names|fileSearchStoreNames|metadata_filter|metadataFilter" /tmp/file-search.*
```

## Docker: Local Usage

This repo supports local dev via `docker-compose.local.yml`.

Commands:

```bash
# Build + start dev server
docker compose -f docker-compose.local.yml up --build

# Run in background
docker compose -f docker-compose.local.yml up --build -d

# Follow logs
docker compose -f docker-compose.local.yml logs -f web

# Stop + remove containers (keeps named volumes unless you add -v)
docker compose -f docker-compose.local.yml down
```

Notes:

- The dev server binds to `0.0.0.0` in the container and is reachable at `http://localhost:3000` on the host.
- The compose file mounts the repo into `/app` and uses a named volume for `/app/node_modules` to avoid host/OS node_modules issues.

## Docker: E2E / Prod-Like Runs

This repo also includes `docker-compose.e2e-live.yml`, which builds a production-like Next.js image (`target: runner`).

Important behavior difference vs the local/dev compose:

- `docker-compose.local.yml` bind-mounts the repo into the container, so code edits are picked up without rebuilding.
- `docker-compose.e2e-live.yml` builds a Docker image; code edits are NOT picked up until you rebuild.

Commands:

```bash
# Build + start prod-like server
docker compose -f docker-compose.e2e-live.yml up -d --build web-prod

# Follow logs
docker compose -f docker-compose.e2e-live.yml logs -f web-prod
```

If you are hitting `http://localhost:3000` and changes “aren't showing up”, check which compose file is running.

## Playwright E2E (With Screenshots)

The Playwright tests live under `tests/ui` and default to running against `http://localhost:3000`.

Commands:

```bash
# Run UI tests (uses playwright.config.js baseURL)
npm run test:ui

# Convenience wrapper for a locally-running server
npm run test:ui:local

# Override base URL (e.g., when server is elsewhere)
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:ui
```

Artifacts:

- Screenshots are captured on failure (see `playwright.config.js`).
- Traces are retained on failure.
- In Docker live runs (`docker-compose.e2e-live.yml`), artifacts are written to `./playwright-artifacts` via a volume.

### Live vs Local Test Gating

- `E2E_LOCAL=1` is used to indicate tests are allowed to hit a locally-running server.
- `E2E_LIVE=1` is used for tests that run inside the `tester` container against `web-prod`.
- Live gate tests that require real model/network calls should be explicitly enabled (e.g. `RUN_LIVE_GATES=1`) and require `GEMINI_API_KEY`.

## Debugging “Old Container” vs “New Code”

When debugging issues that seem to “not change” after edits, confirm you're talking to the correct server build.

Recommended quick check: call `/api/ask` with `debug: true` and verify you see debug metadata in SSE.

Example (SSE stream):

```bash
curl -N -X POST "http://localhost:3000/api/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"debug probe","debug":true}'
```

## Reminder: Run Builds Yourself

Don’t ask the user to run builds/tests when it’s possible to do it here.

- Prefer running:
  - `docker compose -f docker-compose.local.yml up --build` for local verification.
  - `docker compose exec web npm run build` to confirm a production build if needed.
- If installs/builds fail due to local machine constraints (Node version, native deps, missing toolchains), move the verification into Docker (Node 20 image) and run it there.
