import { getSetting } from "./db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;
const FILE_SEARCH_UPLOAD_URL = process.env.FILE_SEARCH_UPLOAD_URL;

function getStoreName() {
  return getSetting("file_search_store_name") || FILE_SEARCH_STORE_NAME || "";
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

  let uploadUrl;
  if (FILE_SEARCH_UPLOAD_URL) {
    if (FILE_SEARCH_UPLOAD_URL.includes("uploadToFileSearchStore")) {
      uploadUrl = FILE_SEARCH_UPLOAD_URL;
    } else {
      const base = FILE_SEARCH_UPLOAD_URL.endsWith("/")
        ? FILE_SEARCH_UPLOAD_URL
        : `${FILE_SEARCH_UPLOAD_URL}/`;
      uploadUrl = `${base}${storePath}:uploadToFileSearchStore?uploadType=media&key=${GEMINI_API_KEY}`;
    }
  } else {
    uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/${storePath}:uploadToFileSearchStore?uploadType=media&key=${GEMINI_API_KEY}`;
  }

  const safeUrl = uploadUrl.replace(/key=[^&]+/i, "key=REDACTED");
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": mimeType || "application/octet-stream"
      },
      body: buffer
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

  return response.json();
}
