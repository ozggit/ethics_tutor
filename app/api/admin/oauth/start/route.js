import { randomUUID } from "crypto";
import { getAuthUrl } from "../../../../lib/driveSync";
import { setSetting } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const state = randomUUID();
  setSetting("google_oauth_state", state);
  const origin = new URL(request.url).origin;
  const redirectUri =
    process.env.OAUTH_REDIRECT_URL || `${origin}/api/admin/oauth/callback`;
  const authUrl = getAuthUrl(redirectUri, state);
  return Response.json({ authUrl });
}
