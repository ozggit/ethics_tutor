function tokenCount(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isStandaloneDefinitionQuestion(question) {
  const q = String(question || "").trim();
  if (!q) return false;

  // Hebrew: "מה זה ...", "מי זה ...", "איזה/איזו ..."
  if (
    /^(?:\u05DE\u05D4|\u05DE\u05D9|\u05D0\u05D9\u05D6\u05D4|\u05D0\u05D9\u05D6\u05D5)\s+(?:\u05D6\u05D4|\u05D6\u05D5|\u05D6\u05D0\u05EA|\u05D4\u05D5\u05D0|\u05D4\u05D9\u05D0)(?:\s|$|[,.!?])/i.test(
      q
    )
  ) {
    return true;
  }

  // English: "what is ...", "who is ..."
  if (/^(?:what|who)\s+(?:is|are)\b/i.test(q)) {
    return true;
  }

  return false;
}

export function extractStandaloneTerm(question) {
  const q = String(question || "").trim();
  if (!q) return "";

  const hebrewMatch = q.match(
    /^(?:\u05DE\u05D4|\u05DE\u05D9|\u05D0\u05D9\u05D6\u05D4|\u05D0\u05D9\u05D6\u05D5)\s+(?:\u05D6\u05D4|\u05D6\u05D5|\u05D6\u05D0\u05EA|\u05D4\u05D5\u05D0|\u05D4\u05D9\u05D0)\s+(.+?)\s*[?.!]*$/i
  );
  if (hebrewMatch) {
    return String(hebrewMatch[1] || "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "");
  }

  const englishMatch = q.match(/^(?:what|who)\s+(?:is|are)\s+(.+?)\s*[?.!]*$/i);
  if (englishMatch) {
    return String(englishMatch[1] || "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "");
  }

  return "";
}

export function shouldUseFollowupContext(question, lastUserTurnText = "") {
  const q = String(question || "").trim();
  if (!q) return false;
  if (!String(lastUserTurnText || "").trim()) return false;

  if (isStandaloneDefinitionQuestion(q)) {
    return false;
  }

  // Direct follow-up openers.
  if (
    /^(?:\u05D5?\u05D0\u05D9\u05DA|\u05D5?\u05DC\u05DE\u05D4|\u05EA\u05E1\u05D1\u05D9\u05E8|\u05EA\u05E8\u05D7\u05D9\u05D1|\u05D0\u05E4\u05E9\u05E8\s+\u05DC\u05D4\u05E8\u05D7\u05D9\u05D1|what about|and what about|can you elaborate|why)\b/i.test(
      q
    )
  ) {
    return true;
  }

  // Short deictic questions like "ומה עם זה?" should carry context.
  const hasDeictic =
    /(?:^|[\s,])(?:\u05D6\u05D4|\u05D6\u05D0\u05EA|\u05D4\u05D6\u05D4|\u05D4\u05D6\u05D0\u05EA|this|that|those)(?=$|[\s,.!?])/i.test(
      q
    );
  if (hasDeictic && tokenCount(q) <= 12) {
    return true;
  }

  return false;
}

export function getUserTurnsForPrompt(recentTurns, limit = 6) {
  const turns = Array.isArray(recentTurns) ? recentTurns : [];
  const userTurns = turns.filter((turn) => turn?.role === "user");
  if (limit <= 0) return [];
  return userTurns.slice(-limit);
}
