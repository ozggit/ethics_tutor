import { getSetting } from "./db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;

const DEFAULT_MODEL = "models/gemini-3-pro-preview";

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
const MATERIALS_PROMPT =
  "השתמש/י בסילבוס כמפת דרכים לקישור בין נושאי הלימוד לחומרי הקריאה, " +
  "ותן/י עדיפות עליונה לתוכן במצגות. ציין/י כיצד ההסבר מתקשר לחומר הכיתתי.";
const SYLLABUS_PROMPT =
  "אם השאלה מתייחסת לסילבוס, דרישות קורס, ציונים או מבנה הקורס, " +
  "חפש/י תחילה בסילבוס וסכם/י ממנו באופן ברור ומובנה.";
const PRACTICE_PROMPT =
  "כאשר מתאים, הצע/י תרגול באמצעות שאלה אמריקאית מקורית המבוססת על עקרונות הקורס.";
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
  "אם זו הודעה ראשונה בשיחה, פתח/י בברכה ידידותית והצע/י 3-4 שאלות מובנות להתחלה.";
const OUTPUT_PROMPT =
  "ענה/י בעברית טבעית, חמה ומעודדת. אפשר להיות מעט יותר מפורט/ת (בערך 8-14 משפטים), " +
  "אבל בלי חזרתיות ובלי נאומים. כתוב/י בפסקאות קצרות, עם Markdown עדין כשזה עוזר. " +
  "מבנה מומלץ (לא חובה): משפט תמציתי לפתיחה, ואז פירוט מסודר עם 2-4 נקודות קצרות, " +
  "ואז דוגמה שמבוססת על חומרי הקורס. " +
  "בסוף: שאל/י שאלת בדיקת הבנה קצרה או בקש/י הבהרה ממוקדת. " +
  "אל תציג/י שלבי חשיבה או הוראות פנימיות ואל תחזיר/י JSON.";

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
    MATERIALS_PROMPT,
    SYLLABUS_PROMPT,
    PRACTICE_PROMPT,
    INTERACTION_PROMPT,
    LANGUAGE_PROMPT,
    REDIRECT_PROMPT,
    CLARIFY_PROMPT,
    OUTPUT_PROMPT
  ];
  if (isFirstTurn) {
    systemParts.splice(3, 0, WELCOME_PROMPT);
  }

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
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  const storeName = getSetting("file_search_store_name") || FILE_SEARCH_STORE_NAME;
  if (!storeName) {
    throw new Error("Missing FILE_SEARCH_STORE_NAME");
  }

  const model = getSetting("gemini_model") || process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    tools: [
      {
        fileSearch: {
          fileSearchStoreNames: [storeName],
          topK: fileSearchConfig?.topK || 8,
          ...(fileSearchConfig?.metadataFilter
            ? { metadataFilter: fileSearchConfig.metadataFilter }
            : {})
        }
      }
    ],
    generationConfig: {
      temperature: 0.45,
      maxOutputTokens: 1100
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

export async function generateGreeting({ userText, systemInstruction }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const model = getSetting("gemini_model") || process.env.GEMINI_MODEL || DEFAULT_MODEL;
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
  const cleaned = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .filter(
      (line) =>
        !/(analyze|synthesize|format|final review|create the json|json structure|step)/i.test(
          line
        )
    )
    .join("\n")
    .trim();
  return cleaned.slice(0, 1200);
}

function inferWeek(text) {
  if (!text) return "";
  const match = String(text).match(/(?:week|lecture|שבוע)\s*(\d{1,2})/i);
  if (match) return `שבוע ${match[1]}`;
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

  return "מסמך הקורס";
}

function extractGroundingReferences(response) {
  const metadata = response?.candidates?.[0]?.groundingMetadata || {};
  const chunks = metadata.groundingChunks || [];
  const references = chunks
    .map((chunk) => {
      const ctx = chunk?.retrievedContext || {};
      const source = pickSourceLabel(ctx);
      const quote = (ctx.text || "").trim().slice(0, 140);
      const week = inferWeek(source) || inferWeek(quote) || "";
      return {
        week,
        part: source,
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
  const rawText = extractText(response);
  const jsonBlock = extractJson(rawText);
  let answer = rawText || "";
  let references = [];

  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock);
      answer = parsed.answer || answer;
      references = Array.isArray(parsed.references) ? parsed.references : [];
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

  if (!references.length) {
    references = extractGroundingReferences(response);
  }

  const grounding = extractGroundingStats(response, rawText);

  return { answer, references, grounding, rawText };
}
