/*
  Smoke test against the running Next app.

  Usage:
    node scripts/smoke-real-ask.mjs "your question"

  Env:
    SMOKE_BASE_URL=http://localhost:3000
*/

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readAskStream({ question, attempts = 1 }) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const startedAt = Date.now();
      const res = await fetch(`${BASE_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("Missing response body");

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
              latencyMs: Date.now() - startedAt
            };
          }

          let obj;
          try {
            obj = JSON.parse(payload);
          } catch {
            continue;
          }

          if (obj?.type === "chunk") answer += String(obj.value || "");
          if (obj?.type === "meta") meta = obj;
        }
      }

      return {
        meta,
        answer,
        latencyMs: Date.now() - startedAt
      };
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(400);
    }
  }
  throw lastErr;
}

const question = process.argv.slice(2).join(" ").trim() ||
  "תסביר/י בפירוט את ההבדל בין תועלתנות לדאונטולוגיה קנטיאנית, לפי חומרי הקורס בלבד, ותן/י דוגמה.";

const { meta, answer, latencyMs } = await readAskStream({ question, attempts: 3 });

console.log(JSON.stringify({
  baseUrl: BASE_URL,
  latencyMs,
  groundingStatus: meta?.groundingStatus,
  citationsCount: Array.isArray(meta?.citations) ? meta.citations.length : 0,
  geminiFinishReason: meta?.geminiFinishReason || "",
  geminiOutputTokens: Number(meta?.geminiOutputTokens || 0),
  geminiThoughtsTokens: Number(meta?.geminiThoughtsTokens || 0),
  answerChars: answer.length,
  answerTail: answer.slice(Math.max(0, answer.length - 220))
}, null, 2));

if (!answer.trim()) process.exitCode = 2;
