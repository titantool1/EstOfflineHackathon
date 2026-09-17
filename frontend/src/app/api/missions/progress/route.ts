import { createMissionHandlers } from "@/lib/server/missions-bff.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return createMissionHandlers().getProgress(request);
}
