import { createMissionHandlers } from "@/lib/server/missions-bff.ts";
export const dynamic="force-dynamic";
export async function POST(request:Request) { return createMissionHandlers().createRecommendation(request); }
