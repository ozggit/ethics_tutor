import test from "node:test";
import assert from "node:assert/strict";

import { parseGeminiResponse } from "../lib/gemini.js";

function makeResponseWithText(text) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text }]
        }
      }
    ]
  };
}

test("parseGeminiResponse: marks NOT_FOUND as notFound", () => {
  const parsed = parseGeminiResponse(makeResponseWithText("NOT_FOUND"));
  assert.equal(parsed.notFound, true);
});

test("parseGeminiResponse: marks NOT_FOUND with punctuation as notFound", () => {
  const parsed = parseGeminiResponse(makeResponseWithText("NOT_FOUND.\n"));
  assert.equal(parsed.notFound, true);
});
