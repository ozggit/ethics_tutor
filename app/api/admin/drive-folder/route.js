import { getSetting, setSetting } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const folder = getSetting("drive_folder_id") || process.env.DRIVE_FOLDER_ID || "";
  return Response.json({ folder });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const folder = (body.folder || "").trim();
  if (!folder) {
    return Response.json({ error: "Folder ID is required" }, { status: 400 });
  }
  if (folder.length > 120) {
    return Response.json({ error: "Folder ID is too long" }, { status: 400 });
  }
  setSetting("drive_folder_id", folder);
  return Response.json({ status: "saved", folder });
}
