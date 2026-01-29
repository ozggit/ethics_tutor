import { setSetting, getSetting } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = getSetting("file_search_store_name") || process.env.FILE_SEARCH_STORE_NAME || "";
  return Response.json({ store });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const store = (body.store || "").trim();
  if (!store) {
    return Response.json({ error: "Store name is required" }, { status: 400 });
  }
  if (store.length > 120) {
    return Response.json({ error: "Store name is too long" }, { status: 400 });
  }
  setSetting("file_search_store_name", store);
  return Response.json({ status: "saved", store });
}
