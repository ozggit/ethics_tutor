import { resetDriveFileCache, setSetting } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const displayName = (body.displayName || "Ethics Course Store").trim();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 400 });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json({ error: data?.error?.message || "Failed to create store" }, { status: 500 });
  }

  const storeName = data?.name || "";
  if (storeName) {
    setSetting("file_search_store_name", storeName);
    resetDriveFileCache();
  }

  return Response.json({ store: storeName, displayName });
}
