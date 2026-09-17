import { createMissionDetailHandler } from "@/lib/server/mission-detail-bff.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request,
  context: RouteContext<"/api/missions/recommendations/[batchId]/items/[itemId]/detail">) {
  const { batchId, itemId } = await context.params;
  return createMissionDetailHandler()(request, batchId, itemId);
}
