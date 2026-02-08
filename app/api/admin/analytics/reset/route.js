import { resetAnalyticsData } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const deletedCount = resetAnalyticsData();
    return Response.json({
      status: "reset",
      deletedCount
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to reset analytics"
      },
      { status: 500 }
    );
  }
}
