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

## Reminder: Run Builds Yourself

Don’t ask the user to run builds/tests when it’s possible to do it here.

- Prefer running:
  - `docker compose -f docker-compose.local.yml up --build` for local verification.
  - `docker compose exec web npm run build` to confirm a production build if needed.
- If installs/builds fail due to local machine constraints (Node version, native deps, missing toolchains), move the verification into Docker (Node 20 image) and run it there.
