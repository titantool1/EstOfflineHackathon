import { NextResponse } from "next/server";

import type { StatsResponse } from "@/features/missions/analytics";
import { buildMissionStats, readMissionEvents } from "@/features/missions/server/event-store";

export const runtime = "nodejs";

export async function GET() {
  const events = await readMissionEvents();
  const overall = { impression: 0, view: 0, accept: 0, skip: 0, complete: 0 };
  for (const event of events) {
    if (event.eventType !== "session_end") overall[event.eventType] += 1;
  }
  const response: StatsResponse = {
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    overall,
    stats: buildMissionStats(events),
  };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
