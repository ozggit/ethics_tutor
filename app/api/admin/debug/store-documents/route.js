import { getSetting } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;

function normalizeStoreName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return "";
  if (trimmed.startsWith("fileSearchStores/")) return trimmed;
  if (trimmed.includes("/")) return trimmed;
  return `fileSearchStores/${trimmed}`;
}

function getStoreName() {
  return normalizeStoreName(
    getSetting("file_search_store_name") || FILE_SEARCH_STORE_NAME || ""
  );
}

async function listDocuments({ storeName, pageSize }) {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: "Missing GEMINI_API_KEY" };
  }
  if (!storeName) {
    return { ok: false, error: "Missing FILE_SEARCH_STORE_NAME" };
  }

  const storePath = normalizeStoreName(storeName);
  const url = `https://generativelanguage.googleapis.com/v1beta/${storePath}/documents?pageSize=${pageSize}&key=${GEMINI_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: data?.error?.message || "List documents failed",
      raw: data
    };
  }
  return { ok: true, raw: data };
}

async function listDocumentsPage({ storeName, pageSize, pageToken }) {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: "Missing GEMINI_API_KEY" };
  }
  if (!storeName) {
    return { ok: false, error: "Missing FILE_SEARCH_STORE_NAME" };
  }

  const storePath = normalizeStoreName(storeName);
  const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
  const url = `https://generativelanguage.googleapis.com/v1beta/${storePath}/documents?pageSize=${pageSize}${tokenParam}&key=${GEMINI_API_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: data?.error?.message || "List documents failed",
      raw: data
    };
  }
  return { ok: true, raw: data };
}

function summarizeDocs(raw) {
  const docs = Array.isArray(raw?.documents) ? raw.documents : [];
  const byMime = {};
  const byState = {};
  for (const d of docs) {
    const mime = d?.mimeType || "(unknown)";
    const state = d?.state || "(unknown)";
    byMime[mime] = (byMime[mime] || 0) + 1;
    byState[state] = (byState[state] || 0) + 1;
  }

  return {
    count: docs.length,
    nextPageToken: raw?.nextPageToken || "",
    byMime,
    byState,
    sample: docs.slice(0, 25).map((d) => ({
      name: d?.name,
      displayName: d?.displayName,
      customMetadata: d?.customMetadata,
      mimeType: d?.mimeType,
      state: d?.state,
      sizeBytes: d?.sizeBytes,
      createTime: d?.createTime,
      updateTime: d?.updateTime
    }))
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  // v1beta list documents enforces 1..20
  const pageSize = Math.max(1, Math.min(20, Number(url.searchParams.get("pageSize") || 20)));
  const pageToken = String(url.searchParams.get("pageToken") || "").trim();
  const pages = Math.max(1, Math.min(10, Number(url.searchParams.get("pages") || 1)));
  const storeName = getStoreName();

  const startedAt = Date.now();
  let listed = await listDocumentsPage({ storeName, pageSize, pageToken });

  if (!listed.ok) {
    return Response.json(
      {
        ok: false,
        storeName,
        pageSize,
        latencyMs: Date.now() - startedAt,
        error: listed.error,
        status: listed.status,
        raw: listed.raw
      },
      { status: 500 }
    );
  }

  if (pages === 1) {
    return Response.json({
      ok: true,
      storeName,
      pageSize,
      pageToken,
      pages,
      latencyMs: Date.now() - startedAt,
      summary: summarizeDocs(listed.raw)
    });
  }

  const all = [];
  let token = pageToken || "";
  for (let i = 0; i < pages; i += 1) {
    const page = await listDocumentsPage({ storeName, pageSize, pageToken: token });
    if (!page.ok) {
      return Response.json(
        {
          ok: false,
          storeName,
          pageSize,
          pageToken,
          pages,
          latencyMs: Date.now() - startedAt,
          error: page.error,
          status: page.status,
          raw: page.raw
        },
        { status: 500 }
      );
    }
    const docs = Array.isArray(page.raw?.documents) ? page.raw.documents : [];
    all.push(...docs);
    token = page.raw?.nextPageToken || "";
    if (!token) break;
  }

  const mergedRaw = { documents: all, nextPageToken: token };
  return Response.json({
    ok: true,
    storeName,
    pageSize,
    pageToken,
    pages,
    latencyMs: Date.now() - startedAt,
    summary: summarizeDocs(mergedRaw)
  });
}
