const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_SEARCH_STORE_NAME = process.env.FILE_SEARCH_STORE_NAME;
const FILE_SEARCH_UPLOAD_URL = process.env.FILE_SEARCH_UPLOAD_URL;

export async function uploadToFileSearchStore({ buffer, filename, mimeType }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  if (!FILE_SEARCH_STORE_NAME) {
    throw new Error("Missing FILE_SEARCH_STORE_NAME");
  }

  const storePath = FILE_SEARCH_STORE_NAME.includes("/")
    ? FILE_SEARCH_STORE_NAME
    : `fileSearchStores/${FILE_SEARCH_STORE_NAME}`;

  let uploadUrl;
  if (FILE_SEARCH_UPLOAD_URL) {
    if (FILE_SEARCH_UPLOAD_URL.includes("files:upload")) {
      uploadUrl = FILE_SEARCH_UPLOAD_URL;
    } else {
      const base = FILE_SEARCH_UPLOAD_URL.endsWith("/")
        ? FILE_SEARCH_UPLOAD_URL
        : `${FILE_SEARCH_UPLOAD_URL}/`;
      uploadUrl = `${base}${storePath}/files:upload?key=${GEMINI_API_KEY}`;
    }
  } else {
    uploadUrl = `https://generativelanguage.googleapis.com/v1beta/${storePath}/files:upload?key=${GEMINI_API_KEY}`;
  }

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  form.append(
    "metadata",
    new Blob([
      JSON.stringify({ displayName: filename, mimeType })
    ], { type: "application/json" })
  );

  const safeUrl = uploadUrl.replace(/key=[^&]+/i, "key=REDACTED");
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      body: form
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
