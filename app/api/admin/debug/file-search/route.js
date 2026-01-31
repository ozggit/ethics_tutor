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

function safePick(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function summarizeGrounding(response) {
  const candidate = response?.candidates?.[0] || {};
  const metadata = candidate?.groundingMetadata || {};
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
  const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : [];

  const sources = chunks
    .map((chunk) => {
      const ctx = chunk?.retrievedContext || {};
      const label =
        safePick(ctx, ["displayName", "title", "documentTitle", "fileName", "name", "uri"]) ||
        "(unknown)";
      return { label };
    })
    .filter((x) => x.label);

  const uniqueSources = [];
  const seen = new Set();
  for (const src of sources) {
    if (seen.has(src.label)) continue;
    seen.add(src.label);
    uniqueSources.push(src);
  }

  return {
    chunksCount: chunks.length,
    supportsCount: supports.length,
    sources: uniqueSources.slice(0, 20)
  };
}

function summarizeCandidate(response) {
  const cand = response?.candidates?.[0] || {};
  const parts = cand?.content?.parts || [];
  const partTypes = parts.map((p) => {
    if (p?.text != null) return "text";
    if (p?.inlineData != null) return "inlineData";
    if (p?.functionCall != null) return "functionCall";
    if (p?.functionResponse != null) return "functionResponse";
    return "unknown";
  });

  const promptFeedback = response?.promptFeedback || {};
  return {
    hasContent: Boolean(cand?.content),
    finishReason: cand?.finishReason || "",
    finishMessage: cand?.finishMessage || "",
    promptBlockReason: promptFeedback?.blockReason || "",
    promptBlockMessage: promptFeedback?.blockReasonMessage || "",
    safetyRatings: Array.isArray(cand?.safetyRatings) ? cand.safetyRatings : [],
    partTypes
  };
}

function pickRawDebug(response) {
  const cand = response?.candidates?.[0] || {};
  const md = cand?.groundingMetadata || {};
  return {
    promptFeedback: response?.promptFeedback || null,
    usageMetadata: response?.usageMetadata || null,
    candidateKeys: Object.keys(cand || {}),
    content: cand?.content || null,
    groundingMetadataKeys: Object.keys(md || {}),
    groundingMetadata: {
      groundingChunks: md?.groundingChunks || null,
      groundingSupports: md?.groundingSupports || null
    }
  };
}

async function generateWithFileSearch({ model, storeName, question, topK, metadataFilter }) {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: "Missing GEMINI_API_KEY" };
  }
  if (!storeName) {
    return { ok: false, error: "Missing FILE_SEARCH_STORE_NAME" };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction =
    "ענה/י אך ורק לפי חומרי הקורס שמופיעים בכלי File Search. " +
    "אם אין התאמה ברורה בחומר, החזר/י בדיוק: NOT_FOUND";

  async function requestGenerateContent(variant) {
    const tool =
      variant === "snake"
        ? {
            file_search: {
              file_search_store_names: [storeName],
              top_k: topK,
              ...(metadataFilter ? { metadata_filter: metadataFilter } : {})
            }
          }
        : {
            fileSearch: {
              fileSearchStoreNames: [storeName],
              topK,
              ...(metadataFilter ? { metadataFilter } : {})
            }
          };

    const body = {
      contents: [{ role: "user", parts: [{ text: question }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools: [tool],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 240
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: data?.error?.message || "Gemini request failed",
        raw: data
      };
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p?.text || "").join("").trim();
    return { ok: true, variant, text, raw: data };
  }

  // First try camelCase, then snake_case if grounding metadata is missing.
  const primary = await requestGenerateContent("camel");
  if (!primary.ok) return primary;
  const md = primary?.raw?.candidates?.[0]?.groundingMetadata || {};
  const hasGrounding =
    (Array.isArray(md.groundingChunks) && md.groundingChunks.length > 0) ||
    (Array.isArray(md.groundingSupports) && md.groundingSupports.length > 0);
  if (hasGrounding) return primary;

  const fallback = await requestGenerateContent("snake");
  if (fallback.ok) {
    fallback.fallbackUsed = true;
  }
  return fallback;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));

  const storeOverride = typeof body.storeName === "string" ? body.storeName.trim() : "";
  const storeName = normalizeStoreName(storeOverride) || getStoreName();
  const model = (
    body.model ||
    getSetting("gemini_retrieval_model") ||
    process.env.GEMINI_RETRIEVAL_MODEL ||
    "models/gemini-2.5-flash"
  ).trim();
  const question = String(body.question || "מה ההבדל בין תועלתנות לחובה מוסרית לפי קאנט?").trim();
  const topK = Number.isFinite(body.topK) ? Math.max(1, Math.min(50, body.topK)) : 12;
  const metadataFilter = typeof body.metadataFilter === "string" ? body.metadataFilter.trim() : "";
  const includeRaw = Boolean(body.includeRaw);

  const startedAt = Date.now();

  const result = await generateWithFileSearch({
    model,
    storeName,
    question,
    topK,
    metadataFilter
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        model,
        storeName,
        topK,
        metadataFilter,
        latencyMs: Date.now() - startedAt,
        error: result.error,
        status: result.status,
        raw: result.raw
      },
      { status: 500 }
    );
  }

  const grounding = summarizeGrounding(result.raw);
  const payload = {
    ok: true,
    model,
    storeName,
    topK,
    metadataFilter,
    latencyMs: Date.now() - startedAt,
    textPreview: result.text.slice(0, 220),
    textLen: result.text.length,
    candidate: summarizeCandidate(result.raw),
    grounding
  };
  if (includeRaw) {
    payload.raw = pickRawDebug(result.raw);
  }
  return Response.json(payload);
}

export async function GET(request) {
  const url = new URL(request.url);
  const model = (
    url.searchParams.get("model") ||
    getSetting("gemini_retrieval_model") ||
    process.env.GEMINI_RETRIEVAL_MODEL ||
    "models/gemini-2.5-flash"
  ).trim();
  const question = String(url.searchParams.get("q") || "מהי דילמה אתית בניהול משאבי אנוש?").trim();
  const topK = Number(url.searchParams.get("topK") || 12);
  const metadataFilter = String(url.searchParams.get("filter") || "").trim();
  const includeRaw = url.searchParams.get("raw") === "1";

  const storeOverride = String(url.searchParams.get("store") || "").trim();

  const storeName = storeOverride || getStoreName();
  const startedAt = Date.now();
  const result = await generateWithFileSearch({
    model,
    storeName,
    question,
    topK: Number.isFinite(topK) ? Math.max(1, Math.min(50, topK)) : 12,
    metadataFilter
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        model,
        storeName,
        topK,
        metadataFilter,
        latencyMs: Date.now() - startedAt,
        error: result.error,
        status: result.status,
        raw: result.raw
      },
      { status: 500 }
    );
  }

  const grounding = summarizeGrounding(result.raw);
  const payload = {
    ok: true,
    model,
    storeName,
    topK,
    metadataFilter,
    latencyMs: Date.now() - startedAt,
    textPreview: result.text.slice(0, 220),
    textLen: result.text.length,
    candidate: summarizeCandidate(result.raw),
    grounding
  };
  if (includeRaw) {
    payload.raw = pickRawDebug(result.raw);
  }
  return Response.json(payload);
}
