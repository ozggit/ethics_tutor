import { createHash } from "crypto";

const TOPIC_RULES = [
  { key: "קאנט ודאונטולוגיה", regex: /(קאנט|kant|דאונטולוג|הצו הקטגורי|categorical imperative)/i },
  { key: "תועלתנות", regex: /(תועלתנ|utilitarian)/i },
  { key: "רולס וצדק", regex: /(רולס|rawls|צדק כהוגנות|מסך הבערות|veil of ignorance)/i },
  { key: "דילמות אתיות", regex: /(דילמה|דילמות|קונפליקט|התנגשות|מקרה מבחן|case study)/i },
  {
    key: "משאבי אנוש ואתיקה ארגונית",
    regex: /(משאבי אנוש|hr|גיוס|פיטור|הטרדה|אפליה|שוויון|שכר|מנהלים|ארגונית)/i
  },
  {
    key: "סילבוס ודרישות הקורס",
    regex: /(סילבוס|דרישות|מטלה|מטלות|בחינה|ציון|שבוע|הרצאה|grading|requirements)/i
  },
  { key: "יסודות אתיקה ומוסר", regex: /(אתיקה|מוסר|ערכים|נורמ|חובה|טוב|רע)/i }
];

function normalizeQuestion(question) {
  return String(question || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickTopic(question) {
  const text = String(question || "");
  for (const rule of TOPIC_RULES) {
    if (rule.regex.test(text)) return rule.key;
  }
  return "נושאים אחרים";
}

function anonymizeSessionId(sessionId) {
  const source = String(sessionId || "").trim() || "unknown";
  const salt = process.env.ANALYTICS_SALT || "analytics-v1";
  return createHash("sha256").update(`${salt}:${source}`).digest("hex").slice(0, 12);
}

function countRepeatUsers(userCounts) {
  let repeatUsers = 0;
  let repeatBySameUser = 0;
  for (const count of userCounts.values()) {
    if (count > 1) {
      repeatUsers += 1;
      repeatBySameUser += count - 1;
    }
  }
  return { repeatUsers, repeatBySameUser };
}

function upsertQuestionCount(topicStats, normalized, sampleQuestion) {
  const existing = topicStats.questionCounts.get(normalized);
  if (existing) {
    existing.count += 1;
    return;
  }
  topicStats.questionCounts.set(normalized, { count: 1, sampleQuestion });
}

export function summarizeAnalyticsRows(rows) {
  const input = Array.isArray(rows) ? rows : [];

  const perQuestion = new Map();
  const perTopic = new Map();
  const anonUsers = new Set();

  for (const row of input) {
    const rawQuestion = String(row?.question || "").trim();
    const normalized = normalizeQuestion(rawQuestion);
    if (!normalized) continue;

    const topic = pickTopic(rawQuestion);
    const anonUser = anonymizeSessionId(row?.session_id);
    const grounded = Number(row?.grounded || 0) === 1;

    anonUsers.add(anonUser);

    let q = perQuestion.get(normalized);
    if (!q) {
      q = {
        normalized,
        question: rawQuestion,
        topic,
        totalCount: 0,
        groundedCount: 0,
        users: new Map()
      };
      perQuestion.set(normalized, q);
    }
    q.totalCount += 1;
    if (grounded) q.groundedCount += 1;
    q.users.set(anonUser, (q.users.get(anonUser) || 0) + 1);

    let t = perTopic.get(topic);
    if (!t) {
      t = {
        topic,
        totalCount: 0,
        groundedCount: 0,
        users: new Map(),
        questionCounts: new Map()
      };
      perTopic.set(topic, t);
    }
    t.totalCount += 1;
    if (grounded) t.groundedCount += 1;
    t.users.set(anonUser, (t.users.get(anonUser) || 0) + 1);
    upsertQuestionCount(t, normalized, rawQuestion);
  }

  const topQueries = [...perQuestion.values()]
    .map((item) => {
      const { repeatUsers, repeatBySameUser } = countRepeatUsers(item.users);
      return {
        question: item.question,
        topic: item.topic,
        count: item.totalCount,
        uniqueUsers: item.users.size,
        repeatUsers,
        repeatBySameUser,
        groundedRate: item.totalCount ? Math.round((item.groundedCount / item.totalCount) * 100) : 0
      };
    })
    .sort((a, b) => b.count - a.count || b.repeatBySameUser - a.repeatBySameUser)
    .slice(0, 8);

  const repeatPatterns = [...perQuestion.values()]
    .map((item) => {
      const { repeatUsers, repeatBySameUser } = countRepeatUsers(item.users);
      return {
        question: item.question,
        topic: item.topic,
        count: item.totalCount,
        uniqueUsers: item.users.size,
        repeatUsers,
        repeatBySameUser
      };
    })
    .filter((item) => item.repeatBySameUser > 0)
    .sort((a, b) => b.repeatBySameUser - a.repeatBySameUser || b.count - a.count)
    .slice(0, 8);

  const hardTopics = [...perTopic.values()]
    .map((item) => {
      const { repeatUsers, repeatBySameUser } = countRepeatUsers(item.users);
      const topTopicQuestion = [...item.questionCounts.values()].sort((a, b) => b.count - a.count)[0];
      return {
        topic: item.topic,
        totalQuestions: item.totalCount,
        uniqueUsers: item.users.size,
        repeatUsers,
        repeatBySameUser,
        groundedRate: item.totalCount ? Math.round((item.groundedCount / item.totalCount) * 100) : 0,
        sampleQuestion: topTopicQuestion?.sampleQuestion || ""
      };
    })
    .sort(
      (a, b) =>
        b.repeatBySameUser - a.repeatBySameUser ||
        b.totalQuestions - a.totalQuestions ||
        a.groundedRate - b.groundedRate
    )
    .slice(0, 8);

  return {
    anonymousUsers: anonUsers.size,
    topQueries,
    repeatPatterns,
    hardTopics
  };
}

