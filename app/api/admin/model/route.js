import { getSetting, setSetting } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const model = getSetting("gemini_model") || process.env.GEMINI_MODEL || "";
  return Response.json({ model });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const model = (body.model || "").trim();
  if (!model) {
    return Response.json({ error: "Model is required" }, { status: 400 });
  }
  if (model.length > 120) {
    return Response.json({ error: "Model is too long" }, { status: 400 });
  }
  setSetting("gemini_model", model);
  return Response.json({ status: "saved", model });
}
