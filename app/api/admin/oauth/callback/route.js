import { exchangeCodeForTokens } from "../../../../lib/driveSync";
import { getSetting, setSetting } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getSetting("google_oauth_state");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  if (!state || !expectedState || state !== expectedState) {
    return new Response("Invalid state", { status: 400 });
  }

  const redirectUri =
    process.env.OAUTH_REDIRECT_URL || `${url.origin}/api/admin/oauth/callback`;
  const result = await exchangeCodeForTokens(code, redirectUri);

  if (!result.ok) {
    return new Response(
      "Authorization succeeded but no refresh token was returned. Please revoke access and try again.",
      { status: 400 }
    );
  }

  setSetting("google_oauth_state", "");

  return new Response(
    "Google Drive connected. You can return to the admin page and run sync.",
    { headers: { "Content-Type": "text/plain" } }
  );
}
