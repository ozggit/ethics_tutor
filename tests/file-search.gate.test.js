import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.VALIDATION_BASE_URL || "http://localhost:3000";
const LIVE_GEMINI_ENABLED = Boolean(process.env.GEMINI_API_KEY) && process.env.RUN_LIVE_GATES === "1";

async function fetchJson(path, init) {
  const attempts = 25;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, init);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { res, text, json };
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(400);
    }
  }

  throw new Error("unreachable");
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureActiveDocuments() {
  const listed = await fetchJson("/api/admin/debug/store-documents?pageSize=20&pages=1", {
    cache: "no-store"
  });
  assert.equal(listed.res.ok, true, `store-documents failed: ${listed.text}`);
  assert.equal(Boolean(listed.json?.ok), true, `store-documents not ok: ${listed.text}`);

  const byState = listed.json?.summary?.byState || {};
  const activeCount = Number(byState.STATE_ACTIVE || 0);
  if (activeCount > 0) return;

  // No active docs: upload a tiny deterministic doc and wait for indexing.
  const sampleText =
    "SAMPLE_DOC: utilitarianism vs kantian deontology; HR ethics: conflicts of interest.";
  const uploaded = await fetchJson("/api/admin/debug/upload-sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sampleText, filename: `gate_sample_${Date.now()}.txt` })
  });
  assert.equal(uploaded.res.ok, true, `upload-sample failed: ${uploaded.text}`);
  assert.equal(Boolean(uploaded.json?.ok), true, `upload-sample not ok: ${uploaded.text}`);

  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(5000);
    const polled = await fetchJson("/api/admin/debug/store-documents?pageSize=20&pages=1", {
      cache: "no-store"
    });
    assert.equal(polled.res.ok, true, `store-documents poll failed: ${polled.text}`);
    const states = polled.json?.summary?.byState || {};
    const active = Number(states.STATE_ACTIVE || 0);
    if (active > 0) return;
  }

  throw new Error("Timed out waiting for STATE_ACTIVE documents in File Search store");
}

async function readAskMeta({ question }) {
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });
  assert.equal(res.ok, true, `ask failed: HTTP ${res.status}`);
  assert.ok(res.body, "ask response missing body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let meta = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventChunk of events) {
      const line = eventChunk
        .split("\n")
        .find((item) => item.startsWith("data: "));
      if (!line) continue;

      const payload = line.replace("data: ", "").trim();
      if (!payload) continue;
      if (payload === "[DONE]") {
        return { meta, latencyMs: Date.now() - startedAt };
      }

      let obj;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }
      if (obj?.type === "meta") {
        meta = obj;
      }
    }
  }

  return { meta, latencyMs: Date.now() - startedAt };
}

async function readAskStream({ question, cookie }) {
  const startedAt = Date.now();
  const res = await fetch(`${BASE_URL}/api/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify({ question })
  });
  assert.equal(res.ok, true, `ask failed: HTTP ${res.status}`);
  assert.ok(res.body, "ask response missing body");

  const setCookie = res.headers.get("set-cookie") || "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let meta = null;
  let answer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventChunk of events) {
      const line = eventChunk
        .split("\n")
        .find((item) => item.startsWith("data: "));
      if (!line) continue;

      const payload = line.replace("data: ", "").trim();
      if (!payload) continue;
      if (payload === "[DONE]") {
        return {
          meta,
          answer,
          setCookie,
          latencyMs: Date.now() - startedAt
        };
      }

      let obj;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }
      if (obj?.type === "chunk") {
        answer += String(obj.value || "");
      }
      if (obj?.type === "meta") {
        meta = obj;
      }
    }
  }

  return { meta, answer, setCookie, latencyMs: Date.now() - startedAt };
}

function toCookieHeader(setCookieValue) {
  const raw = String(setCookieValue || "").trim();
  if (!raw) return "";
  // Convert `Set-Cookie: a=b; Path=/; HttpOnly...` to request header `Cookie: a=b`
  return raw.split(";")[0].trim();
}

test(
  "File Search gate: store has active documents",
  { timeout: 180000, skip: !LIVE_GEMINI_ENABLED },
  async () => {
    await ensureActiveDocuments();
  }
);

test(
  "File Search gate: debug query returns retrieved chunks",
  { timeout: 180000, skip: !LIVE_GEMINI_ENABLED },
  async () => {
    await ensureActiveDocuments();

  const q = encodeURIComponent("utilitarianism vs kantian deontology");
  const debug = await fetchJson(`/api/admin/debug/file-search?q=${q}&topK=12`, { cache: "no-store" });
  assert.equal(debug.res.ok, true, `file-search debug failed: ${debug.text}`);
  assert.equal(Boolean(debug.json?.ok), true, `file-search debug not ok: ${debug.text}`);

  const chunks = Number(debug.json?.grounding?.chunksCount || 0);
  assert.ok(chunks > 0, `Expected chunksCount > 0, got ${chunks}. Full: ${debug.text}`);

  const preview = String(debug.json?.textPreview || "");
  assert.ok(preview.length > 0, "Expected non-empty textPreview");
  assert.notEqual(preview.trim(), "NOT_FOUND", "Expected not NOT_FOUND from debug query");
  }
);

test(
  "Ask gate: response is grounded/weak and not excessively slow",
  { timeout: 180000, skip: !LIVE_GEMINI_ENABLED },
  async () => {
    await ensureActiveDocuments();

  const { meta, latencyMs } = await readAskMeta({
    question: "Explain utilitarianism vs kantian deontology (use only course materials)."
  });

  assert.ok(meta, "Expected SSE meta event from /api/ask");
  assert.ok(
    meta.groundingStatus === "grounded" || meta.groundingStatus === "weak",
    `Expected grounded/weak, got ${meta.groundingStatus}`
  );
  assert.ok(Array.isArray(meta.citations), "Expected citations array");
  assert.equal(meta.citations.length, 0, "Expected citations to be hidden in UI payload");

  // Soft latency gate: if this fails consistently, the app likely does too many Gemini calls.
  assert.ok(latencyMs < 25000, `Too slow: ${latencyMs}ms (expected < 25000ms)`);
  }
);

test(
  "Greeting gate: hello responds quickly",
  { timeout: 180000 },
  async () => {
    const { meta, latencyMs } = await readAskStream({ question: "hello" });
    assert.ok(meta, "Expected SSE meta event from /api/ask");
    assert.ok(
      ["not_applicable", "grounded", "weak", "not_found"].includes(meta.groundingStatus),
      `Unexpected greeting groundingStatus: ${meta.groundingStatus}`
    );
    assert.ok(latencyMs < 12000, `Greeting too slow: ${latencyMs}ms (expected < 12000ms)`);
  }
);

test(
  "Formatting gate: no excessive whitespace and citations are specific strings",
  { timeout: 180000, skip: !LIVE_GEMINI_ENABLED },
  async () => {
    await ensureActiveDocuments();

  const { meta, answer } = await readAskStream({
    question: "Explain utilitarianism vs kantian deontology (use only course materials)."
  });
  assert.ok(meta, "Expected SSE meta event from /api/ask");

  assert.ok(answer.length > 0, "Expected non-empty streamed answer");
  assert.equal(/\n{3,}/.test(answer), false, "Expected no 3+ consecutive newlines");
  assert.equal(/[ \t]+\n/.test(answer), false, "Expected no trailing whitespace before newline");

  assert.ok(Array.isArray(meta.citations), "Expected citations array");
  assert.equal(meta.citations.length, 0, "Expected citations to be hidden in UI payload");
  }
);

test(
  "Sources gate: requesting sources returns an explanation (citations hidden)",
  { timeout: 180000, skip: !LIVE_GEMINI_ENABLED },
  async () => {
    await ensureActiveDocuments();

  const first = await readAskStream({
    question: "Explain utilitarianism vs kantian deontology (use only course materials)."
  });
  const cookie = toCookieHeader(first.setCookie);
  assert.ok(cookie, "Expected session cookie from first ask");

  const second = await readAskStream({ question: "אפשר לקבל את המקורות? תודה.", cookie });
  assert.ok(second.meta, "Expected SSE meta event from /api/ask");
  assert.ok(Array.isArray(second.meta.citations), "Expected citations array");
  assert.equal(second.meta.citations.length, 0, "Expected citations to be hidden in UI payload");
  assert.ok(/לא מציגים|לא\s+מציגים|לא\s+מציג/i.test(second.answer), "Expected an explanation about hidden citations");
  }
);
