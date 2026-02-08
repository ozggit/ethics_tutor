async function readSetting(key) {
  try {
    const mod = await import("./db.js");
    return mod.getSetting(key);
  } catch {
    // Unit tests may run without optional native deps used by db.js.
    return null;
  }
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY;
}

function getDefaultStoreName() {
  return process.env.FILE_SEARCH_STORE_NAME;
}

const DEFAULT_GREETING_MODEL = "models/gemini-2.5-flash";
const DEFAULT_RETRIEVAL_MODEL = "models/gemini-2.5-flash";
const FALLBACK_FILE_SEARCH_MODEL = "models/gemini-2.5-flash";

function normalizeStoreName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return "";
  if (trimmed.startsWith("fileSearchStores/")) return trimmed;
  if (trimmed.includes("/")) return trimmed;
  return `fileSearchStores/${trimmed}`;
}

const PERSONA_PROMPT =
  "את/ה עוזר/ת הוראה וכמרצה בקורס 'מבוא לאתיקה למש" +
  "א' במכללה האקדמית כנרת, עבור סטודנטים לתואר ראשון בניהול משאבי אנוש.";
const GOALS_PROMPT =
  "סייע/י לסטודנטים להבין גישות שונות לאתיקה ומוסר, את החומר הנלמד, " +
  "ואת הקשר בין הנושאים השונים בקורס. המטרה היא למידה עמוקה והבנה, " +
  "עם ניסוח חם ומעודד.";
const GROUNDING_PROMPT =
  "הסתמך/י באופן בלעדי על חומרי הידע שסופקו בכלי File Search, " +
  "בדגש על מצגות הקורס והסילבוס. אל תוסיף/י ידע חיצוני.";
const NOT_FOUND_PROMPT =
  "החזר/י בדיוק NOT_FOUND רק אם כלי File Search לא מחזיר מידע רלוונטי לשאלה. " +
  "אם יש התאמה חלקית (גם אם קצרה), תן/י תשובה קצרה שמבוססת רק על מה שנמצא, " +
  "וציין/י שהמידע בחומר המצורף חלקי והצע/י כיצד לחדד את השאלה.";
const MATERIALS_PROMPT =
  "השתמש/י בסילבוס כמפת דרכים לקישור בין נושאי הלימוד לחומרי הקריאה, " +
  "ותן/י עדיפות עליונה לתוכן במצגות. ציין/י כיצד ההסבר מתקשר לחומר הכיתתי.";
const SYLLABUS_PROMPT =
  "אם השאלה מתייחסת לסילבוס, דרישות קורס, ציונים או מבנה הקורס, " +
  "חפש/י תחילה בסילבוס וסכם/י ממנו באופן ברור ומובנה.";
const PRACTICE_PROMPT =
  "Offer a practice question only if the student explicitly asks for a quiz, practice, or an exercise.";
const INTERACTION_PROMPT =
  "הסבר/י מושגים מורכבים בצורה פשוטה ונגישה לסטודנטים בניהול משאבי אנוש. " +
  "השתמש/י בדוגמאות עסקיות רלוונטיות רק אם הן מופיעות בחומרי הקורס. " +
  "בסוף כל תשובה, שאל/י אם ההסבר ברור ואם יש שאלות נוספות.";
const LANGUAGE_PROMPT =
  "ברירת המחדל היא עברית תקנית וברורה. אם הסטודנט מבקש שפה אחרת, " +
  "ענה/י בה אך שלב/י מונחים מקצועיים בעברית.";
const REDIRECT_PROMPT =
  "אם נשאלת שאלה שאינה קשורה לקורס, הפנה/י בעדינות לנושאי הקורס והצע/י דוגמה לשאלה מתאימה.";
const CLARIFY_PROMPT =
  "אם המונח המבוקש לא נמצא בדיוק בחומר, בקש/י הבהרה לאיזה מושג והקשר הוא מתכוון.";
const WELCOME_PROMPT =
  "If this is the first message, keep the opening to one short sentence before answering the question.";
const OUTPUT_PROMPT =
  "Answer in clear, natural Hebrew. Keep responses concise: about 4-8 short sentences or 3-5 bullets. " +
  "Avoid long introductions, repeated points, and extra sections. " +
  "Do not add a practice question unless explicitly requested. " +
  "End with one short follow-up question. " +
  "Do not include citation markers like [cite: 1, 2].";

function looksLikeEmptyThoughtsResponse(data) {
  const cand = data?.candidates?.[0] || {};
  const parts = cand?.content?.parts || [];
  const hasText = parts.some((p) => typeof p?.text === "string" && p.text.trim());
  const finishReason = String(cand?.finishReason || "");
  const thoughts = Number(data?.usageMetadata?.thoughtsTokenCount || 0);
  return !hasText && finishReason === "MAX_TOKENS" && thoughts > 0;
}

function isThinkingConfigError(err) {
  const msg = String(err?.message || "");
  return /thinkingConfig|thinking_config|Unknown name|Invalid JSON payload|Budget 0 is invalid|only works in thinking mode/i.test(
    msg
  );
}

export function buildPrompt({ question, recentTurns, lastGroundedQuestion, isFirstTurn }) {
  const history = recentTurns
    .map((turn) => `${turn.role === "user" ? "סטודנט" : "עוזר"}: ${turn.text}`)
    .join("\n");

  const context = lastGroundedQuestion
    ? `שאלה אחרונה עם מקור: ${lastGroundedQuestion}`
    : "";

  const systemParts = [
    PERSONA_PROMPT,
    GOALS_PROMPT,
    GROUNDING_PROMPT,
    NOT_FOUND_PROMPT,
    MATERIALS_PROMPT,
    SYLLABUS_PROMPT,
    PRACTICE_PROMPT,
    INTERACTION_PROMPT,
    LANGUAGE_PROMPT,
    REDIRECT_PROMPT,
    CLARIFY_PROMPT,
    OUTPUT_PROMPT
  ];

  const userText = `${context}\n\nשיחות אחרונות:\n${history}\n\nשאלה: ${question}`;

  return { systemInstruction: systemParts.join("\n"), userText };
}

export function buildGreetingPrompt(question) {
  const systemInstruction = [
    PERSONA_PROMPT,
    GOALS_PROMPT,
    GROUNDING_PROMPT,
    "ענה/י בברכה ידידותית ונלהבת, בניסוח טבעי ולא רובוטי, עם משפט פתיחה אישי.",
    "הצע/י 3-4 שאלות מובנות על חומרי הקורס כדי להתחיל את הלמידה.",
    LANGUAGE_PROMPT,
    OUTPUT_PROMPT
  ].join("\n");

  return {
    systemInstruction,
    userText: question || "שלום"
  };
}

export async function generateAnswer({ userText, systemInstruction, fileSearchConfig }) {
  const GEMINI_API_KEY = getGeminiApiKey();
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  const storeName = normalizeStoreName(
    (await readSetting("file_search_store_name")) || getDefaultStoreName()
  );
  if (!storeName) {
    throw new Error("Missing FILE_SEARCH_STORE_NAME");
  }

  const model =
    (await readSetting("gemini_retrieval_model")) ||
    process.env.GEMINI_RETRIEVAL_MODEL ||
    DEFAULT_RETRIEVAL_MODEL;

  function buildUrl(modelName) {
    return `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
  }

  function buildFileSearchTool(variant) {
    const topK = fileSearchConfig?.topK || 8;
    const metadataFilter = fileSearchConfig?.metadataFilter;

    if (variant === "snake") {
      return {
        file_search: {
          file_search_store_names: [storeName],
          top_k: topK,
          ...(metadataFilter ? { metadata_filter: metadataFilter } : {})
        }
      };
    }

    return {
      fileSearch: {
        fileSearchStoreNames: [storeName],
        topK,
        ...(metadataFilter ? { metadataFilter } : {})
      }
    };
  }

  async function requestGenerateContent(variant, opts = {}) {
    const modelName = opts.model || model;
    const maxOutputTokens = opts.maxOutputTokens ?? 1500;
    const disableThinking = opts.disableThinking !== false;

    const body = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      tools: [buildFileSearchTool(variant)],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens
      }
    };

    if (disableThinking) {
      // Avoid "thinking" consuming the entire output budget.
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const response = await fetch(buildUrl(modelName), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || JSON.stringify(data);
      throw new Error(`Gemini request failed: ${message}`);
    }

    return data;
  }

  async function requestWithThinkingFallback(variant, opts = {}) {
    try {
      return await requestGenerateContent(variant, { ...opts, disableThinking: true });
    } catch (err) {
      if (!isThinkingConfigError(err)) throw err;
      return requestGenerateContent(variant, { ...opts, disableThinking: false });
    }
  }

  async function requestWithModelFallback(variant, opts = {}) {
    const primary = await requestWithThinkingFallback(variant, opts);
    if (!looksLikeEmptyThoughtsResponse(primary)) return primary;

    // One last attempt with a known-fast model for retrieval.
    try {
      return await requestWithThinkingFallback(variant, {
        ...opts,
        model: FALLBACK_FILE_SEARCH_MODEL,
        maxOutputTokens: Math.max(opts.maxOutputTokens ?? 1500, 2200)
      });
    } catch {
      return primary;
    }
  }

  // API docs sometimes show snake_case tool config. To avoid breaking existing
  // deployments, try camelCase first, then fallback if we got no grounding signal.
  const primary = await requestWithModelFallback("camel");
  const md = primary?.candidates?.[0]?.groundingMetadata || {};
  const hasGrounding =
    (Array.isArray(md.groundingChunks) && md.groundingChunks.length > 0) ||
    (Array.isArray(md.groundingSupports) && md.groundingSupports.length > 0);

  if (hasGrounding) {
    return primary;
  }

  // Only retry when grounding is missing; this keeps latency impact limited.
  return requestWithModelFallback("snake");
}

export async function generateGreeting({ userText, systemInstruction }) {
  const GEMINI_API_KEY = getGeminiApiKey();
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const model =
    (await readSetting("gemini_greeting_model")) ||
    process.env.GEMINI_GREETING_MODEL ||
    (await readSetting("gemini_model")) ||
    process.env.GEMINI_MODEL ||
    DEFAULT_GREETING_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 360
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed: ${text}`);
  }

  return response.json();
}

function extractText(response) {
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  return parts.map((part) => part.text || "").join("").trim();
}

function isNotFoundText(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (t === "NOT_FOUND") return true;
  // Some models may add punctuation/newlines despite instructions.
  return /^NOT_FOUND[\s.!?]*$/i.test(t);
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.slice(start, end + 1);
}

function extractAnswerFromText(text) {
  if (!text) return "";
  const jsonMatch = text.match(/[`"]?answer[`"]?\s*[:=]\s*["“]([\s\S]*?)["”]/i);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  const hebrewMatch = text.match(/(?:תשובה|מענה)\s*[:\-]\s*([^\n]+)/);
  if (hebrewMatch) {
    return hebrewMatch[1].trim();
  }

  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => String(line).replace(/[ \t]+$/g, ""));

  const filtered = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /(analyze|synthesize|format|final review|create the json|json structure|step)/i.test(trimmed)
    ) {
      continue;
    }
    filtered.push(line);
  }

  // Preserve paragraph breaks but avoid whitespace explosions.
  const collapsed = [];
  let lastBlank = true;
  for (const line of filtered) {
    const isBlank = !String(line).trim();
    if (isBlank) {
      if (!lastBlank) collapsed.push("");
      lastBlank = true;
      continue;
    }
    collapsed.push(line.trim());
    lastBlank = false;
  }

  return collapsed.join("\n").trim();
}

function inferWeek(text) {
  if (!text) return "";
  const s = String(text);
  const match = s.match(/(?:week|wk|w|lecture|שבוע)[\s_\-]*0*(\d{1,2})/i);
  if (match) return `שבוע ${String(match[1]).padStart(2, "0")}`;

  // Common filename patterns like Week02_Lecture.pdf
  const fileMatch = s.match(/\bweek[_\- ]?0*(\d{1,2})\b/i);
  if (fileMatch) return `שבוע ${String(fileMatch[1]).padStart(2, "0")}`;
  return "";
}

function extractFileName(text) {
  if (!text) return "";
  const match = String(text).match(/[\p{L}\p{N}_\-\.]+\.(pdf|docx|pptx|xlsx|txt|doc|ppt)/iu);
  return match ? match[0] : "";
}

function pickSourceLabel(ctx = {}) {
  const candidates = [
    ctx.title,
    ctx.displayName,
    ctx.fileName,
    ctx.documentTitle,
    ctx.name,
    ctx.uri
  ].filter(Boolean);

  for (const item of candidates) {
    const filename = extractFileName(item);
    if (filename) return filename;
    if (typeof item === "string" && item.trim()) return item.trim();
  }

  return "";
}

function extractPageMarker(text) {
  if (!text) return "";
  const m = String(text).match(/---\s*PAGE\s*(\d{1,4})\s*---/i);
  if (!m) return "";
  return String(m[1]);
}

function extractGroundingReferences(response) {
  const metadata = response?.candidates?.[0]?.groundingMetadata || {};
  const chunks = metadata.groundingChunks || [];
  const references = chunks
    .map((chunk) => {
      const ctx = chunk?.retrievedContext || {};
      const store = typeof ctx.fileSearchStore === "string" ? ctx.fileSearchStore.trim() : "";
      const source = pickSourceLabel(ctx) || store;
      const rawQuote = (ctx.text || "").trim();
      const quote =
        rawQuote.length > 180 ? `${rawQuote.slice(0, 180).trimEnd()}…` : rawQuote;

      const page = extractPageMarker(rawQuote);
      const part = source
        ? page
          ? `${source} p.${page}`
          : source
        : "";

      const week = inferWeek(source) || inferWeek(quote) || "";
      return {
        week,
        part,
        quote
      };
    })
    .filter((ref) => ref.part || ref.quote);

  const seen = new Set();
  return references.filter((ref) => {
    const key = `${ref.week}-${ref.part}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractGroundingStats(response, rawText) {
  const metadata = response?.candidates?.[0]?.groundingMetadata || {};
  const chunksCount = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks.length : 0;
  const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : [];
  const supportsCount = supports.length;

  const text = typeof rawText === "string" ? rawText : "";
  const textLen = text.length;
  if (!textLen || !supportsCount) {
    return {
      chunksCount,
      supportsCount,
      supportedChars: 0,
      coverage: 0
    };
  }

  const ranges = [];
  for (const support of supports) {
    const seg = support?.segment || {};
    const start = Number.isFinite(seg.startIndex) ? seg.startIndex : null;
    const end = Number.isFinite(seg.endIndex) ? seg.endIndex : null;
    if (start === null || end === null) continue;
    if (end <= start) continue;
    const a = Math.max(0, Math.min(textLen, start));
    const b = Math.max(0, Math.min(textLen, end));
    if (b <= a) continue;
    ranges.push([a, b]);
  }

  if (!ranges.length) {
    return {
      chunksCount,
      supportsCount,
      supportedChars: 0,
      coverage: 0
    };
  }

  ranges.sort((r1, r2) => r1[0] - r2[0] || r1[1] - r2[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1]) {
      merged.push(range);
      continue;
    }
    last[1] = Math.max(last[1], range[1]);
  }

  let supportedChars = 0;
  for (const [a, b] of merged) {
    supportedChars += b - a;
  }

  const coverage = supportedChars / textLen;
  return {
    chunksCount,
    supportsCount,
    supportedChars,
    coverage: Number.isFinite(coverage) ? coverage : 0
  };
}

export function parseGeminiResponse(response) {
  const cand = response?.candidates?.[0] || {};
  const finishReason = typeof cand?.finishReason === "string" ? cand.finishReason : "";
  const usageMetadata = response?.usageMetadata || {};

  const rawText = extractText(response);
  const jsonBlock = extractJson(rawText);
  let answer = rawText || "";
  let references = [];
  let notFound = isNotFoundText(rawText);

  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock);
      answer = parsed.answer || answer;
      references = Array.isArray(parsed.references) ? parsed.references : [];
      notFound = notFound || isNotFoundText(parsed.answer);
    } catch (error) {
      references = [];
    }
  }

  if (!jsonBlock || !answer || answer === rawText) {
    const extracted = extractAnswerFromText(rawText);
    if (extracted) {
      answer = extracted;
    }
  }

  // File Search grounded responses may include inline citation markers like:
  //   [cite: 1, 2, 3]
  // which cause the UI to look like the answer is duplicated/noisy.
  answer = String(answer || "")
    .replace(/\s*\[\s*cite\s*:\s*[0-9\s,]+\s*\]\s*/gi, " ")
    .replace(/\s*,\s*cite\s*:\s*[0-9\s,]+\s*/gi, " ")
    .replace(/\s*\bcite\s*:\s*[0-9\s,]+\s*/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ \n/g, "\n")
    .trim();

  if (!references.length) {
    references = extractGroundingReferences(response);
  }

  const grounding = extractGroundingStats(response, rawText);

  return {
    answer,
    references,
    grounding,
    rawText,
    notFound,
    finishReason,
    usageMetadata
  };
}
