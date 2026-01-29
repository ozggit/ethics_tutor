const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;

const MODEL = "models/gemini-2.5-pro";

export function buildPrompt(question, recentTurns, lastGroundedQuestion) {
  const history = recentTurns
    .map((turn) => `${turn.role === "user" ? "סטודנט" : "עוזר"}: ${turn.text}`)
    .join("\n");

  const context = lastGroundedQuestion
    ? `שאלה אחרונה עם מקור: ${lastGroundedQuestion}`
    : "";

  return `את/ה עוזר/ת לימודי/ת לקורס אתיקה. מותר להשתמש רק במידע שמגיע מכלי File Search.
אם אין מידע רלוונטי בחומרי הקורס, החזר תשובה שמסבירה שאין התאמה ברורה ומציעה לחדד.
חובה להחזיר JSON תקין בלבד עם המפתחות: answer, references.
references הוא מערך של אובייקטים עם week, part, quote.
\n${context}\n\nשיחות אחרונות:\n${history}\n\nשאלה: ${question}`;
}

export async function generateAnswer(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  if (!FILE_SEARCH_STORE_NAME) {
    throw new Error("Missing FILE_SEARCH_STORE_NAME");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
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
      maxOutputTokens: 800
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

export function parseGeminiResponse(response) {
  const text = extractText(response);
  const jsonBlock = extractJson(text);
  if (!jsonBlock) {
    return { answer: text || "", references: [] };
  }
  try {
    const parsed = JSON.parse(jsonBlock);
    const answer = parsed.answer || "";
    const references = Array.isArray(parsed.references) ? parsed.references : [];
    return { answer, references };
  } catch (error) {
    return { answer: text || "", references: [] };
  }
}
