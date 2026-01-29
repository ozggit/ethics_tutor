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

  const uploadUrl =
    FILE_SEARCH_UPLOAD_URL ||
    `https://generativelanguage.googleapis.com/v1beta/${storePath}/files:upload?key=${GEMINI_API_KEY}`;

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  form.append(
    "metadata",
    new Blob([
      JSON.stringify({ displayName: filename, mimeType })
    ], { type: "application/json" })
  );

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    const suffix = text ? ` ${text}` : "";
    throw new Error(
      `File Search upload failed (${response.status} ${response.statusText}).${suffix}`
    );
  }

  return response.json();
}
