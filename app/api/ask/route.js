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
import { getOrCreateSessionId } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sseChunk(controller, payload) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function createStream(answer, meta) {
  const chunks = answer.match(/.{1,40}(\s|$)/g) || [answer];
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

function shouldRewrite(question) {
  return /(זה|זאת|הזה|הזאת|הם|הן|this|that|those)/i.test(question);
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

export async function POST(request) {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const question = (body.question || "").trim();
  const week = body.week ? String(body.week).trim() : "";
  const docType = body.type ? String(body.type).trim() : "";

  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const { sessionId, setCookie } = getOrCreateSessionId(request.headers.get("cookie"));
  touchSession(sessionId);

  const recentTurns = getRecentTurns(sessionId, 12);
  const isFirstTurn = recentTurns.length === 0;
  const lastUserTurn = [...recentTurns].reverse().find((turn) => turn.role === "user");
  const lastRefs = getLastReferences(sessionId);

  let finalAnswer = "";
  let citations = [];
  let groundingStatus = "not_applicable";

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
  } else if (isSourceRequest(question)) {
    if (lastRefs) {
      finalAnswer = lastRefs.answer || "הנה המקורות שהשתמשתי בהם בפעם האחרונה.";
      citations = lastRefs.refs || [];
      groundingStatus = citations.length ? "grounded" : "not_found";
    } else {
      finalAnswer = "אין לי מקורות אחרונים לשיתוף. אפשר לשאול שאלה מתוך החומר ואז לבקש מקורות.";
      groundingStatus = "not_found";
    }
  } else if (isGroundingCheck(question)) {
    if (lastRefs && lastRefs.refs && lastRefs.refs.length) {
      finalAnswer = "כן. התשובה האחרונה נשענה על חומרי הקורס המצורפים.";
      citations = lastRefs.refs;
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

    const rewritten = shouldRewrite(preparedQuestion) && lastUserTurn
      ? `בהקשר לשאלה הקודמת "${lastUserTurn.text}": ${preparedQuestion}`
      : preparedQuestion;

    const promptPayload = buildPrompt({
      question: rewritten,
      recentTurns,
      lastGroundedQuestion: lastRefs?.question,
      isFirstTurn
    });
    const metadataFilter = syllabusQuery
      ? 'type="syllabus"'
      : detectedWeek
        ? `week="${detectedWeek}"`
        : "";
    const geminiResponse = await generateAnswer({
      ...promptPayload,
      fileSearchConfig: {
        metadataFilter,
        topK: syllabusQuery || detectedWeek ? 10 : 8
      }
    });
    const parsed = parseGeminiResponse(geminiResponse);
    finalAnswer = parsed.answer;
    citations = parsed.references.map((ref) => {
      const parts = [ref.week, ref.part].filter(Boolean);
      if (parts.length) return parts.join(" — ");
      if (ref.quote) return ref.quote;
      return "מסמך הקורס";
    });
    groundingStatus = citations.length ? "grounded" : "not_found";

    if (!citations.length) {
      finalAnswer =
        "לא מצאתי התאמה ברורה בחומרי הקורס לשאלה הזו. אפשר לחדד שבוע, נושא או שם פרק כדי שאוכל לבדוק שוב?";
    } else {
      setLastReferences(sessionId, rewritten, parsed.answer, parsed.references);
    }
  }

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
    sessionId
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
