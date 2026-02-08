import { NextResponse } from "next/server";
import {
  addAnalytics,
  addTurn,
  getLastReferences,
  getRecentTurns,
  setLastReferences,
  touchSession
} from "../../../lib/db";
import {
  buildGreetingPrompt,
  buildPrompt,
  generateAnswer,
  generateGreeting,
  parseGeminiResponse
} from "../../../lib/gemini";
import {
  extractStandaloneTerm,
  getUserTurnsForPrompt,
  shouldUseFollowupContext
} from "../../../lib/chatContext";
import { getOrCreateSessionId } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sseChunk(controller, payload) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function createStream(answer, meta) {
  const size = 60;
  const chunks = [];
  const text = String(answer || "");
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  if (chunks.length === 0) chunks.push("");
  return new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        sseChunk(controller, { type: "chunk", value: chunk });
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      sseChunk(controller, { type: "meta", ...meta });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

function isGreetingOnly(question) {
  const trimmed = question.trim();
  if (!trimmed) return false;
  return /^(hi|hello|hey|shalom|שלום|היי|הי|מה\s+שלומך|מה\s+נשמע|בוקר\s+טוב|ערב\s+טוב)\s*[.!?]*$/i.test(
    trimmed
  );
}

function isSourceRequest(question) {
  return /(מקורות|מקור|ציטוט|ציטוטים|sources|references)/i.test(question);
}

function isGroundingCheck(question) {
  return /(מבוסס|grounded|מקורות|מבוססת)/i.test(question) && /(האם|is)/i.test(question);
}

function isSyllabusQuery(question) {
  return /(סילבוס|syllabus|מבנה הקורס|נושאי הקורס|דרישות הקורס|מטלות|ציון|הערכה|grading|requirements)/i.test(
    question
  );
}

function detectWeekLabel(question) {
  const match = String(question).match(/(?:week|wk|w|שבוע|הרצאה)\s*0*(\d{1,2})/i);
  if (!match) return "";
  return String(match[1]).padStart(2, "0");
}

function pickGroundingDecision(parsed) {
  if (parsed?.notFound) {
    return {
      grounded: false,
      weak: false,
      reason: "model_not_found",
      supportsCount: 0,
      coverage: 0
    };
  }

  const refsCount = parsed?.references?.length || 0;
  const stats = parsed?.grounding || {};
  const supports = Number(stats.supportsCount || 0);
  const coverage = Number(stats.coverage || 0);
  const chunksCount = Number(stats.chunksCount || 0);

  // Docs: citations/grounding metadata may be absent even when File Search is used.
  // We still need a safety gate:
  // - Best: at least some groundingSupports coverage.
  // - Acceptable: retrieved chunks exist (citations), even if supports are missing.
  // - Otherwise: treat as ungrounded.
  const strong = supports >= 1 && (coverage >= 0.08 || supports >= 2);
  if (strong) {
    return {
      grounded: true,
      weak: false,
      reason: "supported",
      supportsCount: supports,
      coverage
    };
  }

  const hasRetrieval = refsCount > 0 || chunksCount > 0;
  if (hasRetrieval) {
    return {
      grounded: true,
      weak: true,
      reason: "retrieved_without_supports",
      supportsCount: supports,
      coverage
    };
  }

  return {
    grounded: false,
    weak: false,
    reason: "no_retrieval_evidence",
    supportsCount: supports,
    coverage
  };
}

function normalizeAnswerText(text) {
  const s = String(text || "");
  if (!s) return "";
  const normalized = s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Some responses include discourse markers mid-paragraph; force a paragraph break.
    .replace(/([.!?…:])\s+(כדי להמחיש זאת)/g, "$1\n\n$2")
    .trim();
  return normalized;
}

function computeInlineCiteCount(text) {
  const s = String(text || "");
  if (!s) return 0;
  const matches = s.match(/\[\s*cite\s*:\s*[0-9\s,]+\s*\]/gi);
  return matches ? matches.length : 0;
}

function computeDuplicatePrefixCount(text) {
  const s = String(text || "").trim();
  if (!s) return 0;

  const norm = s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const prefix = norm.slice(0, 80).trim();
  if (prefix.length < 24) return 0;

  let idx = 0;
  let count = 0;
  while (true) {
    idx = norm.indexOf(prefix, idx);
    if (idx === -1) break;
    count += 1;
    idx += prefix.length;
  }
  return count;
}

function tokenizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function computeTermCoverage(term, text) {
  const termTokens = [...new Set(tokenizeForMatch(term))];
  if (!termTokens.length) return 0;
  const textSet = new Set(tokenizeForMatch(text));
  let covered = 0;
  for (const token of termTokens) {
    if (textSet.has(token)) covered += 1;
  }
  return covered / termTokens.length;
}

function applyStandaloneTermGuard(standaloneTerm, parsed, decision) {
  if (!standaloneTerm || !decision?.grounded) return decision;
  const coverage = computeTermCoverage(standaloneTerm, parsed?.answer || "");
  if (coverage >= 0.8) return decision;
  return {
    grounded: false,
    weak: false,
    reason: "term_mismatch",
    supportsCount: Number(decision.supportsCount || 0),
    coverage: Number(decision.coverage || 0)
  };
}

function normalizeCitation(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const label = item.trim();
    if (!label) return null;
    return { label, week: "", part: "", quote: "" };
  }
  if (typeof item !== "object") {
    const label = String(item).trim();
    if (!label) return null;
    return { label, week: "", part: "", quote: "" };
  }

  const labelFromInput = typeof item.label === "string" ? item.label.trim() : "";
  let week = typeof item.week === "string" ? item.week.trim() : "";
  const part = typeof item.part === "string" ? item.part.trim() : "";
  const quote = typeof item.quote === "string" ? item.quote.trim() : "";

  if (!week) {
    const sourceText = `${labelFromInput} ${part}`;
    const m = sourceText.match(/\bweek[_\- ]?0*(\d{1,2})\b/i);
    if (m) week = `שבוע ${String(m[1]).padStart(2, "0")}`;
  }

  const labelParts = [week, part].filter(Boolean);
  const label = labelFromInput || labelParts.join(" — ") || "מקור מתוך File Search";
  return { label, week, part, quote };
}

function formatCitations(items) {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const normalized = normalizeCitation(item);
    if (!normalized) continue;

    const key = `${normalized.label}::${normalized.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export async function POST(request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const question = (body.question || "").trim();
  const standaloneTerm = extractStandaloneTerm(question);
  const week = body.week ? String(body.week).trim() : "";
  const docType = body.type ? String(body.type).trim() : "";
  const debug = body.debug === true;

  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
  const reqUrl = new URL(request.url);
  const isHttps = (forwardedProto || reqUrl.protocol.replace(":", "")) === "https";

  const { sessionId, setCookie } = getOrCreateSessionId(request.headers.get("cookie"), {
    secure: isHttps
  });
  touchSession(sessionId);

  const recentTurns = getRecentTurns(sessionId, 12);
  const isFirstTurn = recentTurns.length === 0;
  const recentUserTurns = getUserTurnsForPrompt(recentTurns, 6);
  const lastUserTurn = recentUserTurns[recentUserTurns.length - 1] || null;
  const lastRefs = getLastReferences(sessionId);

  let finalAnswer = "";
  let citations = [];
  let groundingStatus = "not_applicable";
  let geminiFinishReason = "";
  let geminiUsage = null;
  let debugMeta = null;

  addTurn(sessionId, "user", question);

  if (isGreetingOnly(question)) {
    try {
      const promptPayload = buildGreetingPrompt(question);
      const response = await generateGreeting(promptPayload);
      finalAnswer = parseGeminiResponse(response).answer;
    } catch (error) {
      finalAnswer =
        "שלום! אני כאן לעזור בשאלות על חומרי הקורס באתיקה.\n" +
        "אפשר לשאול למשל:\n" +
        "- מה ההבדל בין תועלתנות לגישה של קאנט?\n" +
        "- תן/י דוגמה לדילמה אתית בניהול משאבי אנוש\n" +
        "- מה העקרונות המרכזיים של אחריות מקצועית?";
    }
    groundingStatus = "not_applicable";
  } else if (
    /(weather|forecast|temperature|rain|humidity|מזג\s*האוויר|תחזית|טמפרטור|גשם|לחות)/i.test(question) &&
    !/(אתיקה|מוסר|קאנט|רולס|תועלתנות|דהונטולוג|משאבי\s*אנוש|hr|קורס)/i.test(question)
  ) {
    finalAnswer =
      "אני כאן לעזור רק בנושאי הקורס באתיקה ובחומרי ההרצאות/סילבוס, " +
      "ולכן אני לא יכול/ה לענות על מזג האוויר. " +
      "אם תרצה/י, שאל/י שאלה על נושא מהקורס (למשל קאנט, תועלתנות, רולס, או דילמות אתיות ב-HR).";
    groundingStatus = "not_applicable";
  } else if (isSourceRequest(question)) {
    finalAnswer =
      "כרגע אנחנו לא מציגים ציטוטים/מקורות במסך כדי למנוע בלבול מהקטעים החלקיים. " +
      "המערכת עדיין מסמנת אם התשובה מבוססת על חומרי הקורס.";
    groundingStatus = lastRefs?.refs?.length ? "grounded" : "not_found";
  } else if (isGroundingCheck(question)) {
    if (lastRefs && lastRefs.refs && lastRefs.refs.length) {
      finalAnswer = "כן. התשובה האחרונה נשענה על חומרי הקורס המצורפים.";
      groundingStatus = "grounded";
    } else {
      finalAnswer = "לא מצאתי התאמה ישירה במקורות האחרונים.";
      groundingStatus = "not_found";
    }
  } else {
    let preparedQuestion = question;
    if (docType) {
      preparedQuestion = `בהקשר של ${docType}, ${preparedQuestion}`;
    }
    if (week) {
      preparedQuestion = `בהקשר לשבוע ${week}, ${preparedQuestion}`;
    }

    const detectedWeek = detectWeekLabel(preparedQuestion);

    const syllabusQuery = isSyllabusQuery(preparedQuestion);
    if (syllabusQuery) {
      preparedQuestion = `סילבוס הקורס: ${preparedQuestion}`;
    }

    const useFollowupContext = shouldUseFollowupContext(preparedQuestion, lastUserTurn?.text || "");
    const rewritten = useFollowupContext && lastUserTurn
      ? `בהקשר לשאלה הקודמת "${lastUserTurn.text}": ${preparedQuestion}`
      : preparedQuestion;
    const promptRecentTurns = useFollowupContext ? recentUserTurns : [];

    const promptPayload = buildPrompt({
      question: rewritten,
      recentTurns: promptRecentTurns,
      lastGroundedQuestion: useFollowupContext ? lastRefs?.question : "",
      isFirstTurn
    });
    const metadataFilter = syllabusQuery
      ? 'type="syllabus"'
      : detectedWeek
        ? `week="${detectedWeek}"`
        : "";

    const requestGemini = async ({ filter, topK }) =>
      generateAnswer({
        ...promptPayload,
        fileSearchConfig: {
          ...(filter ? { metadataFilter: filter } : {}),
          topK
        }
      });

    // Retrieval strategy:
    // 1) Start broad (no filter) to avoid over-filtering.
    // 2) If the user explicitly asks for syllabus/week OR grounding is weak, try filtered.
    const unfilteredTopK = syllabusQuery || detectedWeek ? 14 : 10;
    const filteredTopK = syllabusQuery || detectedWeek ? 10 : 8;

    let geminiResponse;
    let parsed;
    let decision;
    let diag = {
      calls: 0,
      unfilteredTopK,
      filteredTopK,
      usedMetadataFilter: Boolean(metadataFilter),
      metadataFilter: metadataFilter || "",
      picked: "unfiltered",
      candidates: {
        unfiltered: null,
        filtered: null,
        rescue: null
      }
    };
    try {
      diag.calls += 1;
      geminiResponse = await requestGemini({ filter: "", topK: unfilteredTopK });
      parsed = parseGeminiResponse(geminiResponse);
      decision = applyStandaloneTermGuard(standaloneTerm, parsed, pickGroundingDecision(parsed));

      diag.candidates.unfiltered = {
        finishReason: parsed.finishReason || "",
        outputTokens: Number(parsed.usageMetadata?.candidatesTokenCount || 0),
        thoughtsTokens: Number(parsed.usageMetadata?.thoughtsTokenCount || 0),
        refsCount: parsed.references?.length || 0,
        supportsCount: decision.supportsCount,
        coverage: decision.coverage,
        rawLen: (parsed.rawText || "").length,
        answerLen: (parsed.answer || "").length,
        inlineCiteCount: computeInlineCiteCount(parsed.rawText),
        duplicatePrefixCount: computeDuplicatePrefixCount(parsed.rawText)
      };

      if (metadataFilter) {
        const shouldTryFiltered =
          syllabusQuery || Boolean(detectedWeek) || !decision.grounded;
        if (shouldTryFiltered) {
          diag.calls += 1;
          const filteredResponse = await requestGemini({
            filter: metadataFilter,
            topK: filteredTopK
          });
          const filteredParsed = parseGeminiResponse(filteredResponse);
          const filteredDecision = applyStandaloneTermGuard(
            standaloneTerm,
            filteredParsed,
            pickGroundingDecision(filteredParsed)
          );

          diag.candidates.filtered = {
            finishReason: filteredParsed.finishReason || "",
            outputTokens: Number(filteredParsed.usageMetadata?.candidatesTokenCount || 0),
            thoughtsTokens: Number(filteredParsed.usageMetadata?.thoughtsTokenCount || 0),
            refsCount: filteredParsed.references?.length || 0,
            supportsCount: filteredDecision.supportsCount,
            coverage: filteredDecision.coverage,
            rawLen: (filteredParsed.rawText || "").length,
            answerLen: (filteredParsed.answer || "").length,
            inlineCiteCount: computeInlineCiteCount(filteredParsed.rawText),
            duplicatePrefixCount: computeDuplicatePrefixCount(filteredParsed.rawText)
          };

          const pickFiltered =
            (filteredParsed.references?.length || 0) >
              (parsed.references?.length || 0) ||
            filteredDecision.supportsCount > decision.supportsCount ||
            filteredDecision.coverage > decision.coverage + 0.05;

          if (pickFiltered) {
            geminiResponse = filteredResponse;
            parsed = filteredParsed;
            decision = filteredDecision;
            diag.picked = "filtered";
          }
        }
      }

      // If we still have no retrieval evidence, try one last broader retrieval.
      if (!decision.grounded) {
        const rescueTopK = Math.max(unfilteredTopK, 20);
        diag.calls += 1;
        const rescueResponse = await requestGemini({ filter: "", topK: rescueTopK });
        const rescueParsed = parseGeminiResponse(rescueResponse);
        const rescueDecision = applyStandaloneTermGuard(
          standaloneTerm,
          rescueParsed,
          pickGroundingDecision(rescueParsed)
        );

        diag.candidates.rescue = {
          finishReason: rescueParsed.finishReason || "",
          outputTokens: Number(rescueParsed.usageMetadata?.candidatesTokenCount || 0),
          thoughtsTokens: Number(rescueParsed.usageMetadata?.thoughtsTokenCount || 0),
          refsCount: rescueParsed.references?.length || 0,
          supportsCount: rescueDecision.supportsCount,
          coverage: rescueDecision.coverage,
          rawLen: (rescueParsed.rawText || "").length,
          answerLen: (rescueParsed.answer || "").length,
          inlineCiteCount: computeInlineCiteCount(rescueParsed.rawText),
          duplicatePrefixCount: computeDuplicatePrefixCount(rescueParsed.rawText)
        };
        if (rescueDecision.grounded) {
          geminiResponse = rescueResponse;
          parsed = rescueParsed;
          decision = rescueDecision;
          diag.picked = "rescue";
        }
      }

      finalAnswer = parsed.answer;
      citations = [];
      groundingStatus = decision.grounded ? (decision.weak ? "weak" : "grounded") : "not_found";

      // Diagnostic-only: helps distinguish app-side truncation vs model MAX_TOKENS.
      // Safe to expose because it's not user content.
      geminiFinishReason = parsed.finishReason || "";
      geminiUsage = parsed.usageMetadata || {};

      if (debug) {
        debugMeta = {
          diag
        };
      }

      if (!decision.grounded) {
        finalAnswer =
          "לא מצאתי התאמה ברורה בחומרי הקורס לשאלה הזו. " +
          "אפשר לחדד שבוע/הרצאה, מונח מדויק, או לצטט משפט מהמצגת כדי שאוכל לאתר את זה?";
      } else {
        setLastReferences(sessionId, rewritten, parsed.answer, parsed.references);
      }
    } catch (error) {
      const msg = String(error?.message || "");
      const looksLikeConfigError = /Missing GEMINI_API_KEY|Missing FILE_SEARCH_STORE_NAME|Gemini request failed/i.test(
        msg
      );
      finalAnswer = looksLikeConfigError
        ? "המערכת לא מוגדרת כרגע (מפתח Gemini או File Search). פתח/י את /admin והגדר/י Gemini + File Search ואז נסה/י שוב."
        : "משהו השתבש בשליפת תשובה מתוך חומרי הקורס. נסו שוב בעוד רגע.";
      citations = [];
      groundingStatus = "not_found";
    }
  }

  finalAnswer = normalizeAnswerText(finalAnswer);

  addTurn(sessionId, "assistant", finalAnswer);

  addAnalytics({
    sessionId,
    question,
    grounded: groundingStatus === "grounded" ? 1 : 0,
    citationsCount: citations.length,
    latencyMs: Date.now() - startedAt
  });

  const stream = createStream(finalAnswer, {
    groundingStatus,
    citations,
    sessionId,
    ...(debugMeta ? { debug: debugMeta } : {}),
    ...(typeof geminiFinishReason === "string" && geminiFinishReason
      ? { geminiFinishReason }
      : {}),
    ...(geminiUsage && typeof geminiUsage === "object"
      ? {
          geminiOutputTokens: Number(geminiUsage.candidatesTokenCount || 0),
          geminiThoughtsTokens: Number(geminiUsage.thoughtsTokenCount || 0)
        }
      : {})
  });

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  };

  if (setCookie) {
    headers["Set-Cookie"] = setCookie;
  }

  return new Response(stream, { headers });
}
