import { createMissionHandlers } from "@/lib/server/missions-bff.ts";
export const dynamic="force-dynamic";
export async function GET(request: Request, context: RouteContext<"/api/missions/recommendations/[batchId]">) {
  const { batchId } = await context.params;
  return createMissionHandlers().getRecommendation(request, batchId);
}
