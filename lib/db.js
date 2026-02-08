import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { summarizeAnalyticsRows } from "./analytics";

const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "app.db");

let dbSingleton = null;
let dbInitialized = false;

export function getDb() {
  if (dbSingleton) return dbSingleton;

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  dbSingleton = db;

  if (!dbInitialized) {
    // Reduce SQLITE_BUSY sensitivity when multiple processes touch the DB.
    // This should not run at module-load time (Next.js build can import routes).
    db.pragma("busy_timeout = 5000");
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT,
        updated_at TEXT,
        last_seen TEXT
      );
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        text TEXT,
        ts TEXT
      );
      CREATE TABLE IF NOT EXISTS last_references (
        session_id TEXT PRIMARY KEY,
        question TEXT,
        answer TEXT,
        refs_json TEXT,
        ts TEXT
      );
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        question TEXT,
        grounded INTEGER,
        citations_count INTEGER,
        latency_ms INTEGER,
        ts TEXT
      );
      CREATE TABLE IF NOT EXISTS drive_files (
        file_id TEXT PRIMARY KEY,
        version TEXT,
        last_synced TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);

    dbInitialized = true;
  }

  return db;
}

const now = () => new Date().toISOString();

export function touchSession(sessionId) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM sessions WHERE id = ?").get(sessionId);
  if (existing) {
    db.prepare("UPDATE sessions SET updated_at = ?, last_seen = ? WHERE id = ?").run(
      now(),
      now(),
      sessionId
    );
    return;
  }
  db.prepare(
    "INSERT INTO sessions (id, created_at, updated_at, last_seen) VALUES (?, ?, ?, ?)"
  ).run(sessionId, now(), now(), now());
}

export function addTurn(sessionId, role, text) {
  const db = getDb();
  db.prepare("INSERT INTO turns (session_id, role, text, ts) VALUES (?, ?, ?, ?)").run(
    sessionId,
    role,
    text,
    now()
  );
}

export function getRecentTurns(sessionId, limit = 12) {
  const db = getDb();
  return db
    .prepare("SELECT role, text, ts FROM turns WHERE session_id = ? ORDER BY id DESC LIMIT ?")
    .all(sessionId, limit)
    .reverse();
}

export function setLastReferences(sessionId, question, answer, refs) {
  const db = getDb();
  const payload = JSON.stringify(refs || []);
  db.prepare(
    `INSERT INTO last_references (session_id, question, answer, refs_json, ts)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       question=excluded.question,
       answer=excluded.answer,
       refs_json=excluded.refs_json,
       ts=excluded.ts`
  ).run(sessionId, question, answer, payload, now());
}

export function getLastReferences(sessionId) {
  const db = getDb();
  const row = db
    .prepare("SELECT question, answer, refs_json FROM last_references WHERE session_id = ?")
    .get(sessionId);
  if (!row) return null;
  let refs = [];
  try {
    refs = JSON.parse(row.refs_json || "[]");
  } catch (error) {
    refs = [];
  }
  return { question: row.question, answer: row.answer, refs };
}

export function addAnalytics({ sessionId, question, grounded, citationsCount, latencyMs }) {
  const db = getDb();
  db.prepare(
    "INSERT INTO analytics (session_id, question, grounded, citations_count, latency_ms, ts) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(sessionId, question, grounded, citationsCount, latencyMs, now());
}

export function getAnalyticsSummary() {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as count FROM analytics").get().count || 0;
  const groundedCount = db
    .prepare("SELECT COUNT(*) as count FROM analytics WHERE grounded = 1")
    .get().count || 0;
  const avgCitations = db
    .prepare("SELECT AVG(citations_count) as avg FROM analytics")
    .get().avg;
  const avgLatency = db
    .prepare("SELECT AVG(latency_ms) as avg FROM analytics")
    .get().avg;

  const last7Days = db
    .prepare(
      `SELECT substr(ts, 1, 10) as date, COUNT(*) as count
       FROM analytics
       WHERE ts >= date('now', '-6 day')
       GROUP BY date
       ORDER BY date DESC`
    )
    .all();

  const analyticsRows = db
    .prepare(
      `SELECT session_id, question, grounded
       FROM analytics
       WHERE question IS NOT NULL`
    )
    .all();
  const advanced = summarizeAnalyticsRows(analyticsRows);

  return {
    totalQuestions: total,
    anonymousUsers: advanced.anonymousUsers,
    groundedRate: total ? Math.round((groundedCount / total) * 100) : 0,
    avgCitations: avgCitations ? avgCitations.toFixed(1) : "0.0",
    avgLatencyMs: avgLatency ? Math.round(avgLatency) : 0,
    last7Days: last7Days.reverse(),
    topQueries: advanced.topQueries,
    repeatPatterns: advanced.repeatPatterns,
    hardTopics: advanced.hardTopics
  };
}

export function resetAnalyticsData() {
  const db = getDb();
  const result = db.prepare("DELETE FROM analytics").run();
  return result?.changes || 0;
}

export function getDriveFileVersion(fileId) {
  const db = getDb();
  const row = db.prepare("SELECT version FROM drive_files WHERE file_id = ?").get(fileId);
  return row?.version || null;
}

export function upsertDriveFile(fileId, version) {
  const db = getDb();
  db.prepare(
    `INSERT INTO drive_files (file_id, version, last_synced)
     VALUES (?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET version=excluded.version, last_synced=excluded.last_synced`
  ).run(fileId, version, now());
}

export function resetDriveFileCache() {
  const db = getDb();
  db.prepare("DELETE FROM drive_files").run();
}

export function getSetting(key) {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value || null;
}

export function setSetting(key, value) {
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).run(key, value, now());
}
