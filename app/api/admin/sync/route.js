import { syncDriveToFileSearch } from "../../../../lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await syncDriveToFileSearch();
  return Response.json(result);
}
