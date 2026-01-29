 Course Tutor Webapp — Implementation Plan (One Repo, Streaming, Gemini File Search)
 Goal
Replace the current n8n workflow with a dedicated webapp that:
- Answers student questions grounded ONLY in course materials (Gemini File Search).
- Is conversational and friendly (Hebrew-first).
- Supports in-session memory and **cross-session persistence** via cookies.
- Provides an admin page for sync + analytics.
- Uses Google Drive as the content source.
- Uses SQLite for MVP analytics and memory storage.
- Streams responses to the client.
 Constraints / Requirements
- Retrieval MUST use Gemini File Search (no external knowledge).
- If no match in materials: respond politely with helpful clarification prompts.
- Persistent memory across sessions via cookie; no identifying data.
- Host on existing Hostinger VPS (Docker).
- Open access for now (no auth).
- Admin page is required (sync + analytics).
- Streaming responses required (typing/partial output).
- Files reside in Google Drive.
 Current Behavior Spec (from n8n)
- Sync: list Drive files → download/convert to PDF → upload to Gemini File Search store → poll operations.
- Q&A: session ID via cookie/header; greeting detection; source request returns last grounded citations; grounding check; default Q&A.
- Strict grounding: if no grounded references found → “not found” + clarification prompts.
 Proposed Stack (One Repo)
**Recommended:** Next.js (App Router)
- Fullstack: UI + API in one repo.
- Easy streaming via Server-Sent Events (SSE) or chunked responses.
- Easy to add admin pages, analytics views.
- Deploy as Docker container.
Alternative (if preferred): Next.js + small background worker in same repo.
 Data Model (SQLite MVP)
Tables (suggested schema):
 sessions
- id (TEXT, primary)
- created_at (TEXT)
- updated_at (TEXT)
- last_seen (TEXT)
 turns
- id (INTEGER, primary)
- session_id (TEXT, index)
- role (TEXT) // "user" | "assistant"
- text (TEXT)
- ts (TEXT)
 last_references
- session_id (TEXT, primary)
- question (TEXT)
- answer (TEXT)
- refs_json (TEXT) // JSON array [{week, part, quote}]
- ts (TEXT)
 analytics
- id (INTEGER, primary)
- session_id (TEXT, index)
- question (TEXT)
- grounded (INTEGER) // 0/1
- citations_count (INTEGER)
- latency_ms (INTEGER)
- ts (TEXT)
 API Endpoints
 POST /api/ask
Input:
{
  "question": "string",
  "week": "optional string",
  "type": "optional string"
}
Behavior:
- Read sessionId from cookie ct_sid (create if missing).
- Build prompt using:
  - persona + tone
  - grounding rules
  - redirect rules
  - welcome message if first session
- Detect:
  - Greeting-only
  - Source request
  - Grounding check
- Branch:
  - Greeting → return welcome + examples.
  - Source request → return last grounded refs if any.
  - Grounding check → return status.
  - Default → call Gemini generateContent with fileSearch tool.
- Parse Gemini output (strict JSON).
- If no grounded refs: return “not found” + helpful clarification prompts.
- Save turn + last refs + analytics.
- Stream response to client.
Response format (SSE or chunked JSON):
{
  answer: string,
  citations: [week — part, ...],
  groundingStatus: grounded|not_found|not_applicable,
  sessionId: string
}
POST /api/admin/sync
- Runs full Drive → Gemini File Search sync.
- Returns job status.
GET /api/admin/analytics
- Returns aggregated analytics (counts, grounded rate, common queries).
Gemini Integration (File Search)
- Use models/gemini-2.5-pro:generateContent.
- Include system instructions requiring strict JSON output:
{ "references": [{"week": string, "part": string, "quote": string}], "answer": string }
- Use fileSearch tool:
"fileSearch": { "fileSearchStoreNames": [STORE_NAME], "topK": 5 }
Google Drive Sync
Steps:
1. List all non-folder files in the configured Drive folder.
2. Track file versions (or hashes) to skip re-uploads.
3. Download/convert to PDF if needed (Docs/Slides/Sheets to PDF).
4. Upload to Gemini File Search store using uploadToFileSearchStore.
5. Poll operation status until done/failed/timeout.
6. Record version on success.
Store metadata in SQLite:
- drive_files (file_id, version, last_synced)
Session Memory Logic
- Store the last ~12 turns per session.
- On follow-ups (“this/that”), rewrite query to include last grounded question.
- Persist last_references for source requests.
- Prune old sessions (e.g., keep last 200 active sessions).
Streaming Responses
- Use SSE via NextResponse streaming or chunked JSON.
- For Gemini, either stream as it arrives or simulate streaming by chunking final answer.
UI (Student Chat)
- Hebrew-first interface.
- Conversational tone.
- Show:
  - Answer (streamed)
  - Grounding status
  - Citations (week + part)
- Provide “Ask for sources” button (optional).
- Minimal UI + course branding.
Admin UI
- Trigger Sync with status.
- Show:
  - total questions
  - grounded rate
  - last 7 days usage
  - most common topics
Branding
- Need exact logo and color palette to implement.
- If none exist, define a simple palette and clean typography.
- Make sure to incorporate course identity (Kinneret Academic College).
Deployment (Hostinger VPS, Docker)
- One container for the webapp.
- SQLite DB in a mounted volume.
- .env for secrets:
  - GEMINI_API_KEY
  - GOOGLE_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN
  - DRIVE_FOLDER_ID
  - FILE_SEARCH_STORE_NAME
- Optional: a cron job or scheduled sync endpoint.
Implementation Steps (Checklist)
1. Bootstrap Next.js app with App Router.
2. Implement SQLite layer.
3. Implement session + memory storage.
4. Implement /api/ask with branching logic.
5. Implement Gemini + File Search integration.
6. Implement Google Drive sync.
7. Build student chat UI.
8. Build admin UI.
9. Add analytics collection + basic dashboard.
10. Dockerize and deploy to Hostinger VPS.
11. Run manual QA with course PDFs.
Notes for Future
- Add authentication (if required later).
- Add analytics export (CSV).
- Add monitoring/alerts.