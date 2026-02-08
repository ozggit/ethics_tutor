import test from "node:test";
import assert from "node:assert/strict";

import {
  extractStandaloneTerm,
  getUserTurnsForPrompt,
  shouldUseFollowupContext
} from "../lib/chatContext.js";

test("shouldUseFollowupContext: treats definition questions as standalone", () => {
  const question = "\u05DE\u05D4 \u05D6\u05D4 \u05EA\u05D7\u05DC\u05D9\u05E3 \u05DE\u05D5\u05E1\u05E8?";
  const result = shouldUseFollowupContext(question, "\u05E9\u05DC\u05D5\u05DD");
  assert.equal(result, false);
});

test("shouldUseFollowupContext: keeps context for explicit short follow-up", () => {
  const question = "\u05EA\u05E1\u05D1\u05D9\u05E8 \u05D0\u05EA \u05D6\u05D4 \u05E9\u05D5\u05D1";
  const result = shouldUseFollowupContext(
    question,
    "\u05DE\u05D4 \u05D4\u05D4\u05D1\u05D3\u05DC \u05D1\u05D9\u05DF \u05E7\u05D0\u05E0\u05D8 \u05DC\u05E8\u05D5\u05DC\u05E1"
  );
  assert.equal(result, true);
});

test("shouldUseFollowupContext: english standalone what-is stays independent", () => {
  const result = shouldUseFollowupContext("what is utilitarianism?", "hello");
  assert.equal(result, false);
});

test("shouldUseFollowupContext: english what-about keeps context", () => {
  const result = shouldUseFollowupContext("what about that?", "kant vs rawls");
  assert.equal(result, true);
});

test("extractStandaloneTerm: extracts Hebrew term from definition question", () => {
  const question = "\u05DE\u05D4 \u05D6\u05D4 \u05E6\u05D3\u05E7 \u05DB\u05D4\u05D5\u05D2\u05E0\u05D5\u05EA?";
  const term = extractStandaloneTerm(question);
  assert.equal(term, "\u05E6\u05D3\u05E7 \u05DB\u05D4\u05D5\u05D2\u05E0\u05D5\u05EA");
});

test("extractStandaloneTerm: extracts English term from what-is question", () => {
  const term = extractStandaloneTerm("what is utilitarianism?");
  assert.equal(term, "utilitarianism");
});

test("extractStandaloneTerm: returns empty string for follow-up query", () => {
  const term = extractStandaloneTerm("\u05EA\u05E1\u05D1\u05D9\u05E8 \u05D0\u05EA \u05D6\u05D4 \u05E9\u05D5\u05D1");
  assert.equal(term, "");
});

test("getUserTurnsForPrompt: keeps only recent user turns", () => {
  const turns = [
    { role: "user", text: "u1" },
    { role: "assistant", text: "a1" },
    { role: "user", text: "u2" },
    { role: "assistant", text: "a2" },
    { role: "user", text: "u3" }
  ];

  const out = getUserTurnsForPrompt(turns, 2);
  assert.deepEqual(out, [
    { role: "user", text: "u2" },
    { role: "user", text: "u3" }
  ]);
});
