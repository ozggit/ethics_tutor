import test from "node:test";
import assert from "node:assert/strict";

import { summarizeAnalyticsRows } from "../lib/analytics.js";

test("summarizeAnalyticsRows: tracks repeated question by same anonymous student", () => {
  const rows = [
    { session_id: "u1", question: "מהי אתיקה תועלתנית?", grounded: 1 },
    { session_id: "u1", question: "מהי אתיקה תועלתנית", grounded: 1 },
    { session_id: "u2", question: "מהי אתיקה תועלתנית?", grounded: 0 }
  ];

  const summary = summarizeAnalyticsRows(rows);
  const first = summary.topQueries[0];

  assert.equal(first.question.length > 0, true);
  assert.equal(first.count, 3);
  assert.equal(first.uniqueUsers, 2);
  assert.equal(first.repeatUsers, 1);
  assert.equal(first.repeatBySameUser, 1);
});

test("summarizeAnalyticsRows: detects hard topics from repeated student attempts", () => {
  const rows = [
    { session_id: "u1", question: "מה ההבדל בין קאנט לרולס?", grounded: 1 },
    { session_id: "u1", question: "מה ההבדל בין קאנט לרולס", grounded: 0 },
    { session_id: "u1", question: "מה ההבדל בין קאנט לרולס?", grounded: 1 },
    { session_id: "u2", question: "קאנט מול רולס", grounded: 1 },
    { session_id: "u3", question: "מהי תועלתנות", grounded: 1 }
  ];

  const summary = summarizeAnalyticsRows(rows);
  const hard = summary.hardTopics[0];

  assert.equal(hard.topic, "קאנט ודאונטולוגיה");
  assert.equal(hard.repeatBySameUser >= 2, true);
  assert.equal(hard.uniqueUsers >= 2, true);
});

test("summarizeAnalyticsRows: does not expose raw session identifiers", () => {
  const rows = [
    { session_id: "student-session-123", question: "מהי אתיקה", grounded: 1 }
  ];
  const summary = summarizeAnalyticsRows(rows);
  const asJson = JSON.stringify(summary);

  assert.equal(asJson.includes("student-session-123"), false);
});

