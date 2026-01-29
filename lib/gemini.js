import { getSetting } from "./db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;

const DEFAULT_MODEL = "models/gemini-3-pro-preview";

const PERSONA_PROMPT =
  "את/ה עוזר/ת הוראה וכמרצה בקורס 'מבוא לאתיקה למש" +
  "א' במכללה האקדמית כנרת, עבור סטודנטים לתואר ראשון בניהול משאבי אנוש.";
const GOALS_PROMPT =
  "סייע/י לסטודנטים להבין גישות שונות לאתיקה ומוסר, את החומר הנלמד, " +
  "ואת הקשר בין הנושאים השונים בקורס. המטרה היא למידה עמוקה והבנה.";
const GROUNDING_PROMPT =
  "הסתמך/י באופן בלעדי על חומרי הידע שסופקו בכלי File Search, " +
  "בדגש על מצגות הקורס והסילבוס. אל תוסיף/י ידע חיצוני.";
const MATERIALS_PROMPT =
  "השתמש/י בסילבוס כמפת דרכים לקישור בין נושאי הלימוד לחומרי הקריאה, " +
  "ותן/י עדיפות עליונה לתוכן במצגות. ציין/י כיצד ההסבר מתקשר לחומר הכיתתי.";
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
  "ענה/י בעברית טבעית, מפורטת ומעודדת (4-8 משפטים), בפסקאות קצרות. " +
  "השתמש/י בעיצוב Markdown עדין כשזה עוזר: כותרות מודגשות ונקודות. " +
  "פורמט מומלץ: **תמצית קצרה:** ... ואז **פירוט:** ... ואז **בדיקת הבנה:** שאלה קצרה. " +
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
    "ענה/י בברכה ידידותית ונלהבת, בניסוח טבעי ולא רובוטי.",
    "הצע/י 3-4 שאלות מובנות על חומרי הקורס כדי להתחיל את הלמידה.",
    LANGUAGE_PROMPT,
    OUTPUT_PROMPT
  ].join("\n");

  return {
    systemInstruction,
    userText: question || "שלום"
  };
}

export async function generateAnswer({ userText, systemInstruction }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  if (!FILE_SEARCH_STORE_NAME) {
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
          fileSearchStoreNames: [FILE_SEARCH_STORE_NAME],
          topK: 5
        }
      }
    ],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 1000
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
      temperature: 0.65,
      maxOutputTokens: 320
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

export function parseGeminiResponse(response) {
  const text = extractText(response);
  const jsonBlock = extractJson(text);
  let answer = text || "";
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

  if (!jsonBlock || !answer || answer === text) {
    const extracted = extractAnswerFromText(text);
    if (extracted) {
      answer = extracted;
    }
  }

  if (!references.length) {
    references = extractGroundingReferences(response);
  }

  return { answer, references };
}
