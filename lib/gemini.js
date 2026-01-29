const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;

const MODEL = "models/gemini-2.5-pro";

const PERSONA_PROMPT = "את/ה עוזר/ת הוראה לקורס אתיקה. דבר/י בעברית טבעית, קצרה וממוקדת.";
const GROUNDING_PROMPT =
  "ענה/י אך ורק על סמך חומרי הקורס שמגיעים מכלי File Search. " +
  "אל תשתמש/י בידע כללי. אם אין התאמה בחומר, כתוב/י שאין התאמה והציע/י לחדד.";
const REDIRECT_PROMPT =
  "אם נשאלת שאלה שאינה קשורה לקורס, הפנה/י בעדינות לנושאי הקורס והצע/י דוגמה לשאלה מתאימה.";
const WELCOME_PROMPT =
  "אם זו הודעה ראשונה בשיחה, פתח/י בברכה קצרה והצע/י 2-3 דוגמאות לשאלות אפשריות.";
const JSON_PROMPT =
  "החזר/י JSON תקין בלבד (ללא Markdown), במבנה: " +
  "{\"answer\": string, \"references\": [{\"week\": string, \"part\": string, \"quote\": string}]}";

export function buildPrompt({ question, recentTurns, lastGroundedQuestion, isFirstTurn }) {
  const history = recentTurns
    .map((turn) => `${turn.role === "user" ? "סטודנט" : "עוזר"}: ${turn.text}`)
    .join("\n");

  const context = lastGroundedQuestion
    ? `שאלה אחרונה עם מקור: ${lastGroundedQuestion}`
    : "";

  const systemParts = [PERSONA_PROMPT, GROUNDING_PROMPT, REDIRECT_PROMPT, JSON_PROMPT];
  if (isFirstTurn) {
    systemParts.splice(3, 0, WELCOME_PROMPT);
  }

  const userText = `${context}\n\nשיחות אחרונות:\n${history}\n\nשאלה: ${question}`;

  return { systemInstruction: systemParts.join("\n"), userText };
}

export async function generateAnswer({ userText, systemInstruction }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  if (!FILE_SEARCH_STORE_NAME) {
    throw new Error("Missing FILE_SEARCH_STORE_NAME");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
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
      temperature: 0.2,
      maxOutputTokens: 800,
      responseMimeType: "application/json"
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

function inferWeek(text) {
  if (!text) return "";
  const match = String(text).match(/(?:week|lecture|שבוע)\s*(\d{1,2})/i);
  if (match) return `שבוע ${match[1]}`;
  return "";
}

function extractGroundingReferences(response) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    .map((chunk) => {
      const ctx = chunk?.retrievedContext || {};
      const source = ctx.title || ctx.uri || "חומר הקורס";
      const quote = (ctx.text || "").trim().slice(0, 140);
      const week = inferWeek(source) || inferWeek(quote) || "חומר הקורס";
      return {
        week,
        part: source,
        quote
      };
    })
    .filter((ref) => ref.part || ref.quote);
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

  if (!references.length) {
    references = extractGroundingReferences(response);
  }

  return { answer, references };
}
