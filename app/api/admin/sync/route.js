import { randomUUID } from "crypto";
import { getAuthUrl, syncDriveToFileSearch } from "../../../../lib/driveSync";
import { setSetting } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const driveSyncDisabled =
    process.env.DISABLE_DRIVE_SYNC === "true" || process.env.NODE_ENV !== "production";
  if (driveSyncDisabled) {
    return Response.json({
      status: "disabled_local",
      message: "Drive sync is disabled in local development."
    });
  }
  const origin = new URL(request.url).origin;
  const redirectUri =
    process.env.OAUTH_REDIRECT_URL || `${origin}/api/admin/oauth/callback`;

  try {
    const result = await syncDriveToFileSearch(redirectUri);
    return Response.json(result);
  } catch (error) {
    if (error?.code === "NEEDS_OAUTH") {
      const state = randomUUID();
      setSetting("google_oauth_state", state);
      const authUrl = getAuthUrl(redirectUri, state);
      return Response.json({ status: "needs_oauth", authUrl });
    }
    return Response.json({ status: "failed", error: error?.message || "Sync failed" }, { status: 500 });
  }
}
