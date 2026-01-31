import test from "node:test";
import assert from "node:assert/strict";

import { parseGeminiResponse } from "../lib/gemini.js";

test("parseGeminiResponse: does not truncate long plain-text answers", () => {
  const marker = "END_MARKER_ANSWER_SHOULD_BE_PRESENT";
  const longLine = "A".repeat(2500);
  const raw = `פתיח קצר\n${longLine}\n${marker}`;

  const response = {
    candidates: [
      {
        content: { parts: [{ text: raw }] },
        groundingMetadata: {
          groundingChunks: [
            {
              retrievedContext: {
                title: "Week 01 - Lecture.pdf",
                text: "ציטוט קצר"
              }
            }
          ]
        }
      }
    ]
  };

  const parsed = parseGeminiResponse(response);
  assert.ok(parsed.answer.includes(marker), "Expected full answer tail marker to be present");
  assert.ok(parsed.answer.length > 2000, "Expected long answer to remain long (no truncation)");
});

test("parseGeminiResponse: strips inline cite markers", () => {
  const raw = "פסקה אחת. [cite: 1, 2, 3]\n\nפסקה שניה, cite: 4,5";
  const response = {
    candidates: [
      {
        content: { parts: [{ text: raw }] },
        groundingMetadata: {
          groundingChunks: [
            {
              retrievedContext: {
                title: "Week 01 - Lecture.pdf",
                text: "ציטוט קצר"
              }
            }
          ]
        }
      }
    ]
  };

  const parsed = parseGeminiResponse(response);
  assert.equal(/\bcite\s*:/i.test(parsed.answer), false);
  assert.equal(/\[\s*cite\s*:/i.test(parsed.answer), false);
});
