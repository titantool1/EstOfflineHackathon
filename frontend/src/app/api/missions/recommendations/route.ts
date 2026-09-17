import { NextResponse } from "next/server";

import type { RecommendationResponse } from "@/features/missions/analytics";
import { isInterestId, missions, type InterestId, type Mission } from "@/features/missions/catalog";
import { readMissionEvents } from "@/features/missions/server/event-store";

export const runtime = "nodejs";
const algorithmVersion = "interest-funnel-v2-explore20";
const explorationRate = 0.2;

function unitHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function missionMetrics(mission: Mission, selected: InterestId[], events: Awaited<ReturnType<typeof readMissionEvents>>, totalExposed: number) {
  const relevantEvents = events.filter((event) => {
    if (event.missionId !== mission.id) return false;
    if (!selected.length) return true;
    return event.interestSnapshot.some((interestId) => selected.includes(interestId));
  });
  const exposed = new Set(relevantEvents.filter((event) => event.eventType === "impression").map((event) => event.anonymousUserId)).size;
  const completed = new Set(relevantEvents.filter((event) => event.eventType === "complete").map((event) => event.anonymousUserId)).size;
  const overlap = selected.length ? mission.interestIds.filter((id) => selected.includes(id)).length / selected.length : 1;
  const smoothedCompletion = (completed + 1.5) / (exposed + 10);
  const uncertainty = Math.min(1, Math.sqrt(Math.log(totalExposed + 2) / (exposed + 1)));
  const exposureBalance = 1 / (exposed + 1);
  const score = overlap * 0.55 + smoothedCompletion * 0.3 + uncertainty * 0.1 + exposureBalance * 0.05;
  return { mission, exposed, completed, score };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selected = [...new Set((url.searchParams.get("interests") ?? "").split(",").filter(isInterestId))];
  const excluded = new Set((url.searchParams.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 100));
  const seed = (url.searchParams.get("seed") ?? `${Date.now()}`).slice(0, 160);
  const candidates = missions.filter((mission) => !excluded.has(mission.id) && (!selected.length || mission.interestIds.some((id) => selected.includes(id))));

  if (!candidates.length) {
    const response: RecommendationResponse = { mission: null, algorithmVersion, reason: "추천 가능한 새 미션을 모두 확인했어요." };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  }

  const events = await readMissionEvents();
  const totalExposed = new Set(events.filter((event) => event.eventType === "impression").map((event) => `${event.anonymousUserId}:${event.missionId}`)).size;
  const ranked = candidates.map((mission) => missionMetrics(mission, selected, events, totalExposed));
  const minimumExposure = Math.min(...ranked.map((item) => item.exposed));
  const hasUnderexposedMission = ranked.some((item) => item.exposed < 3);
  const isExploration = hasUnderexposedMission || unitHash(`${seed}:mode`) < explorationRate;

  let chosen: (typeof ranked)[number];
  if (isExploration) {
    const explorationPool = ranked
      .filter((item) => item.exposed === minimumExposure)
      .sort((a, b) => unitHash(`${seed}:${a.mission.id}`) - unitHash(`${seed}:${b.mission.id}`));
    chosen = explorationPool[0];
  } else {
    chosen = [...ranked].sort((a, b) => b.score - a.score || unitHash(`${seed}:${a.mission.id}`) - unitHash(`${seed}:${b.mission.id}`))[0];
  }

  const mission = chosen.mission;
  const response: RecommendationResponse = {
    mission,
    algorithmVersion,
    reason: isExploration
      ? "관심사에 맞는 후보 중 아직 노출이 적은 미션도 공정하게 학습할 수 있도록 탐색 추천했어요."
      : selected.length
        ? "같은 관심사 사용자의 완료율과 표본 불확실성, 노출 균형을 함께 반영했어요."
        : "전체 사용자의 완료율과 노출 균형을 함께 반영했어요.",
  };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
