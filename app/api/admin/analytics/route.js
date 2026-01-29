import { getAnalyticsSummary } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summary = getAnalyticsSummary();
  return Response.json(summary);
}
