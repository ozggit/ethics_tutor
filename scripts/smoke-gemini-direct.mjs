/*
  Smoke test calling Gemini directly (bypasses Next route).

  Requires:
    GEMINI_API_KEY
    FILE_SEARCH_STORE_NAME

  Usage:
    node scripts/smoke-gemini-direct.mjs "your question"
*/

import { buildPrompt, generateAnswer, parseGeminiResponse } from "../lib/gemini.js";

const question = process.argv.slice(2).join(" ").trim() ||
  "תסביר/י בפירוט את עקרון התועלתנות לפי חומרי הקורס בלבד.";

const promptPayload = buildPrompt({
  question,
  recentTurns: [],
  lastGroundedQuestion: "",
  isFirstTurn: true
});

const response = await generateAnswer({
  ...promptPayload,
  fileSearchConfig: {
    topK: Number(process.env.SMOKE_TOP_K || 12) || 12
  }
});

const parsed = parseGeminiResponse(response);

console.log(JSON.stringify({
  finishReason: parsed.finishReason,
  usage: parsed.usageMetadata,
  referencesCount: Array.isArray(parsed.references) ? parsed.references.length : 0,
  answerChars: String(parsed.answer || "").length,
  answerTail: String(parsed.answer || "").slice(Math.max(0, String(parsed.answer || "").length - 220))
}, null, 2));
