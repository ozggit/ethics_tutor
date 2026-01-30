import { getSetting } from "./db";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;
const FILE_SEARCH_UPLOAD_URL = process.env.FILE_SEARCH_UPLOAD_URL;

function getStoreName() {
  return getSetting("file_search_store_name") || FILE_SEARCH_STORE_NAME || "";
}

function inferWeekFromFilename(filename) {
  if (!filename) return "";
  const match = String(filename).match(
    /(?:week|lecture|wk|w|שבוע|הרצאה)[^0-9]*(\d{1,2})/i
  );
  if (!match) return "";
  return String(match[1]).padStart(2, "0");
}

function inferTypeFromFilename(filename) {
  if (!filename) return "";
  const lower = String(filename).toLowerCase();
  if (lower.includes("syllabus") || lower.includes("סילבוס")) return "syllabus";
  return "";
}

function buildUploadUrl(storePath) {
  if (FILE_SEARCH_UPLOAD_URL) {
    if (FILE_SEARCH_UPLOAD_URL.includes("uploadToFileSearchStore")) {
      const hasUploadType = FILE_SEARCH_UPLOAD_URL.includes("uploadType=");
      const joiner = FILE_SEARCH_UPLOAD_URL.includes("?") ? "&" : "?";
      const withUploadType = hasUploadType
        ? FILE_SEARCH_UPLOAD_URL
        : `${FILE_SEARCH_UPLOAD_URL}${joiner}uploadType=multipart`;
      return withUploadType.includes("key=")
        ? withUploadType
        : `${withUploadType}${withUploadType.includes("?") ? "&" : "?"}key=${GEMINI_API_KEY}`;
    }
    const base = FILE_SEARCH_UPLOAD_URL.endsWith("/")
      ? FILE_SEARCH_UPLOAD_URL
      : `${FILE_SEARCH_UPLOAD_URL}/`;
    return `${base}${storePath}:uploadToFileSearchStore?uploadType=multipart&key=${GEMINI_API_KEY}`;
  }

  return `https://generativelanguage.googleapis.com/upload/v1beta/${storePath}:uploadToFileSearchStore?uploadType=multipart&key=${GEMINI_API_KEY}`;
}

export async function uploadToFileSearchStore({ buffer, filename, mimeType }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  const storeName = getStoreName();
  if (!storeName) {
    throw new Error("Missing FILE_SEARCH_STORE_NAME");
  }

  const storePath = storeName.includes("/") ? storeName : `fileSearchStores/${storeName}`;
  const uploadUrl = buildUploadUrl(storePath);
  const safeUrl = uploadUrl.replace(/key=[^&]+/i, "key=REDACTED");

  const week = inferWeekFromFilename(filename);
  const type = inferTypeFromFilename(filename);
  const customMetadata = [];
  if (week) customMetadata.push({ key: "week", stringValue: week });
  if (type) customMetadata.push({ key: "type", stringValue: type });
  const isValidMime = typeof mimeType === "string" && /^[^\s/]+\/[^\s/]+$/.test(mimeType);
  const safeMimeType = isValidMime ? mimeType : "application/octet-stream";

  const metadata = {
    displayName: filename,
    mimeType: safeMimeType,
    customMetadata,
    // Keep chunks reasonably sized for slide-like PDFs.
    chunkingConfig: {
      whiteSpaceConfig: {
        maxTokensPerChunk: 380,
        maxOverlapTokens: 40
      }
    }
  };

  // Google-style media upload expects multipart/related (not multipart/form-data).
  const boundary = `fs_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=utf-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${safeMimeType}\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(preamble, "utf8"),
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
    Buffer.from(epilogue, "utf8")
  ]);

  const headers = {
    "Content-Type": `multipart/related; boundary=${boundary}`,
    "Content-Length": String(body.length)
  };
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers,
      body
    });
  } catch (error) {
    console.error("File Search upload request failed", safeUrl, error?.message || error);
    throw new Error(`File Search upload request failed: ${error?.message || "unknown error"}`);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(
      "File Search upload failed",
      response.status,
      response.statusText,
      safeUrl,
      text
    );
    const suffix = text ? ` ${text}` : "";
    throw new Error(
      `File Search upload failed (${response.status} ${response.statusText}).${suffix}`
    );
  }

  const operation = await response.json();

  // Poll LRO until it completes.
  const opName = operation?.name;
  if (!opName || operation?.done) {
    if (operation?.error?.message) {
      throw new Error(`File Search upload failed: ${operation.error.message}`);
    }
    return operation;
  }

  const opUrl = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${GEMINI_API_KEY}`;
  let attempt = 0;
  while (attempt < 30) {
    attempt += 1;
    await sleep(Math.min(1500, 250 + attempt * 50));
    const opResp = await fetch(opUrl);
    const opData = await opResp.json().catch(() => ({}));
    if (!opResp.ok) {
      const msg = opData?.error?.message || `operation poll failed (${opResp.status})`;
      throw new Error(`File Search upload failed: ${msg}`);
    }
    if (opData?.done) {
      if (opData?.error?.message) {
        throw new Error(`File Search upload failed: ${opData.error.message}`);
      }
      return opData;
    }
  }

  return operation;
}
