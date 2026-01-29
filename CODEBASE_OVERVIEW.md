Codebase Overview

Purpose
- Web chat tutor for the "מבוא לאתיקה" course.
- Answers grounded only in File Search materials, with admin sync + analytics.

Architecture
- Next.js App Router app with serverless API routes.
- SQLite for sessions, analytics, and admin settings.
- Google Drive sync + Gemini File Search ingestion.

Key Paths
- UI: `app/page.js`, `app/components/ChatClient.js`, `app/globals.css`
- Admin UI: `app/admin/page.js`, `app/components/AdminClient.js`
- Chat API: `app/api/ask/route.js`
- Admin APIs: `app/api/admin/*` (analytics, sync, model, store, drive-folder)
- Integrations: `lib/gemini.js`, `lib/fileSearch.js`, `lib/driveSync.js`
- Data: `lib/db.js` (SQLite schema + helpers)

Runtime Flow
- Admin sync pulls Drive files -> uploads to File Search store.
- Chat requests use File Search tool in Gemini.
- Responses stream to the client via SSE.

Key Settings
- `GEMINI_API_KEY`
- `FILE_SEARCH_STORE_NAME` (admin override supported)
- `DRIVE_FOLDER_ID` (admin override supported)
- `GEMINI_MODEL` (admin override supported)
