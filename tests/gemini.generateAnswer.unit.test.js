import test from "node:test";
import assert from "node:assert/strict";

import { generateAnswer } from "../lib/gemini.js";

function makeJsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return data;
    }
  };
}

test("generateAnswer: retries with snake_case file_search tool when grounding metadata missing", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.FILE_SEARCH_STORE_NAME = "fileSearchStores/test-store";

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    return makeJsonResponse({
      candidates: [
        {
          content: { parts: [{ text: "OK" }] },
          groundingMetadata: {}
        }
      ]
    });
  };

  try {
    await generateAnswer({
      userText: "Q",
      systemInstruction: "S",
      fileSearchConfig: { topK: 3 }
    });

    assert.equal(calls.length, 2);
    assert.ok(calls[0].body.tools?.[0]?.fileSearch);
    assert.ok(calls[1].body.tools?.[0]?.file_search);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateAnswer: falls back when thinkingConfig is rejected", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.FILE_SEARCH_STORE_NAME = "fileSearchStores/test-store";

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });

    // First attempt includes thinkingConfig and fails.
    if (calls.length === 1) {
      return makeJsonResponse(
        {
          error: {
            message: "Invalid JSON payload received. Unknown name \"thinkingConfig\""
          }
        },
        { ok: false, status: 400 }
      );
    }

    // Second attempt should omit thinkingConfig.
    return makeJsonResponse({
      candidates: [
        {
          content: { parts: [{ text: "OK" }] },
          groundingMetadata: { groundingChunks: [{ retrievedContext: { text: "x" } }] }
        }
      ]
    });
  };

  try {
    await generateAnswer({
      userText: "Q",
      systemInstruction: "S",
      fileSearchConfig: { topK: 3 }
    });

    // 1st call fails (thinkingConfig rejected), 2nd succeeds without thinkingConfig.
    assert.equal(calls.length, 2);
    assert.ok(calls[0].body.generationConfig?.thinkingConfig);
    assert.equal(calls[1].body.generationConfig?.thinkingConfig, undefined);
    // Because grounding is present on success, we should not proceed to snake_case fallback.
    assert.ok(calls[1].body.tools?.[0]?.fileSearch);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateAnswer: falls back when model requires thinking mode (thinkingBudget 0 invalid)", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.FILE_SEARCH_STORE_NAME = "fileSearchStores/test-store";
  process.env.GEMINI_RETRIEVAL_MODEL = "models/gemini-3-pro-preview";

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });

    // First attempt includes thinkingBudget: 0 and fails.
    if (calls.length === 1) {
      return makeJsonResponse(
        {
          error: {
            message: "Budget 0 is invalid. This model only works in thinking mode."
          }
        },
        { ok: false, status: 400 }
      );
    }

    // Second attempt should omit thinkingConfig.
    return makeJsonResponse({
      candidates: [
        {
          content: { parts: [{ text: "OK" }] },
          groundingMetadata: { groundingChunks: [{ retrievedContext: { text: "x" } }] }
        }
      ]
    });
  };

  try {
    await generateAnswer({
      userText: "Q",
      systemInstruction: "S",
      fileSearchConfig: { topK: 3 }
    });

    assert.equal(calls.length, 2);
    assert.ok(calls[0].body.generationConfig?.thinkingConfig);
    assert.equal(calls[1].body.generationConfig?.thinkingConfig, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_RETRIEVAL_MODEL;
  }
});

test("generateAnswer: retries with fallback model on empty MAX_TOKENS+thoughts response", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.FILE_SEARCH_STORE_NAME = "fileSearchStores/test-store";

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });

    if (calls.length === 1) {
      return makeJsonResponse({
        usageMetadata: { thoughtsTokenCount: 200 },
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [] },
            groundingMetadata: { groundingChunks: [{ retrievedContext: { text: "x" } }] }
          }
        ]
      });
    }

    return makeJsonResponse({
      candidates: [
        {
          content: { parts: [{ text: "OK" }] },
          groundingMetadata: { groundingChunks: [{ retrievedContext: { text: "x" } }] }
        }
      ]
    });
  };

  try {
    await generateAnswer({
      userText: "Q",
      systemInstruction: "S",
      fileSearchConfig: { topK: 3 }
    });

    assert.equal(calls.length, 2);
    assert.ok(String(calls[1].url).includes("models/gemini-2.5-flash"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
