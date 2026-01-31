Git Workflow Lessons (Ethics Tutor)

Purpose
- Preserve hard-won fixes from recent build and deploy errors.
- Provide a repeatable, low-friction checklist for future Git + CI + Docker issues.

Core Lessons
- Always capture the exact CI error lines; generic exit codes are not actionable.
- Fix one root cause at a time, then re-run the pipeline.
- Prefer pushing minimal changes that isolate the fix and reduce blast radius.
- Keep secrets out of Git; use runtime env injection instead.

CI / Docker Build Lessons
- "npm run build" failures require the exact Next.js error lines to debug.
- Missing directories in Docker COPY (e.g., /app/public) will hard-fail builds.
  - Ensure required directories exist in repo (use a placeholder file if needed).
- Alpine images can break native Node modules (e.g., better-sqlite3).
  - Use Debian base images (bookworm-slim) with build tools installed.
- Next.js App Router paths are sensitive to import depth.
  - Verify relative import paths for deeply nested routes.
- For Next.js + native modules, set:
  - next.config.js: serverExternalPackages: ["better-sqlite3"]

GitHub Actions / GHCR Lessons
- The workflow runs are named after commit messages, not separate workflows.
- A GHCR package appears only after a successful build and push.
- GHCR "denied" on VPS means the package is private or not published yet.
  - Fix the build first; then set GHCR package visibility to public.

VPS Deploy Lessons (Hostinger)
- Hostinger Docker Compose deployments do not build from "build:".
  - Use "image:" with a prebuilt registry image.
- Re-deploy by updating the compose project and pulling the new image.
- Traefik routing requires label + network alignment.

Operational Checklist
1) Reproduce error and copy the exact CI lines (last 20-40 lines).
2) Apply smallest fix possible and push.
3) Verify GH Actions run is green.
4) Confirm GHCR package exists and is public.
5) Update VPS compose to pull the latest image.
6) Validate the app endpoint.

Common Fixes Applied (This Project)
- Debian base image with build tools for better-sqlite3.
- Corrected OAuth route import depth.
- Added public/.keep to satisfy Docker COPY.
- Externalized better-sqlite3 in Next.js server config.

Notes
- Keep .env untracked; inject secrets at deploy time.
- If build errors repeat, always ask for exact CI error lines.
