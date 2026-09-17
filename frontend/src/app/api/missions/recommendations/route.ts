import { NextResponse } from "next/server";

import type { RecommendationResponse } from "@/features/missions/analytics";
import { isInterestId, missions, type InterestId, type Mission } from "@/features/missions/catalog";
import { readMissionEvents } from "@/features/missions/server/event-store";

export const runtime = "nodejs";
const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://127.0.0.1:8000";
const algorithmVersion = "interest-data-funnel-v3-explore20";
const explorationRate = 0.2;

type SearchRecommendation = {
  docId: string;
  policyId?: string | null;
  actionId?: string | null;
  docType: "policy" | "action" | "place";
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  region?: string | null;
  address?: string | null;
  conditions?: string | null;
  sourceUrl?: string | null;
  needsReview?: boolean;
  interestIds?: string[];
};

function resultToMission(result: SearchRecommendation, selected: InterestId[]): Mission {
  const mapped = (result.interestIds ?? []).filter(isInterestId).filter((id) => id !== "unsure");
  const interestIds = selected.includes("unsure")
    ? ["unsure" as const]
    : mapped.length ? mapped : selected.length ? selected : ["unsure" as const];
  const title = result.title?.trim() || "친환경 혜택 정보";
  const location = [result.region, result.address].filter(Boolean).join(" · ");
  const templates = result.docType === "place"
    ? {
        icon: "📍",
        title: `${title} 이용 정보 확인하기`,
        steps: [location ? `위치 확인: ${location}` : "위치와 이동 경로 확인하기", "방문 전 운영시간과 실제 혜택 여부 확인하기", "현장에서 친환경 활동 실천하기"],
        duration: "방문 전 5분",
      }
    : result.docType === "action"
      ? {
          icon: "🌱",
          title: `${title} 혜택 확인하고 실천하기`,
          steps: ["참여 대상과 조건 확인하기", "공식 출처에서 참여처·운영 여부 확인하기", "가능하면 오늘 한 번 실천하기"],
          duration: "약 10분",
        }
      : {
          icon: "🎁",
          title: `${title} 신청 조건 확인하기`,
          steps: ["내가 대상에 해당하는지 확인하기", "지원 기간과 준비물 확인하기", "공식 출처에서 신청 방법 확인하기"],
          duration: "약 10분",
        };

  return {
    id: `data:${result.docId}`,
    icon: templates.icon,
    title: templates.title,
    summary: result.summary || result.conditions || "선택한 관심사와 연결된 친환경 정보예요.",
    howTo: templates.steps,
    benefit: result.conditions || result.summary || "상세 혜택과 최신 운영 여부는 공식 출처에서 확인해 주세요.",
    duration: templates.duration,
    interestIds,
    sourceProgramId: result.policyId || result.actionId || result.docId,
    sourceDocId: result.docId,
    sourceUrl: result.sourceUrl || undefined,
    sourceType: result.docType,
    verificationStatus: result.needsReview ? "needs-review" : "verified",
  };
}

async function mappedCandidates(selected: InterestId[], excluded: Set<string>, seed: string): Promise<Mission[]> {
  const response = await fetch(`${AI_SERVER_URL}/api/interest-recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      interest_ids: selected,
      region: "서울특별시",
      size: 60,
      exclude_doc_ids: [...excluded].filter((id) => id.startsWith("data:")).map((id) => id.slice(5)),
      seed,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("interest_recommendation_failed");
  const payload = await response.json() as { results?: SearchRecommendation[] };
  return (payload.results ?? [])
    .filter((result) => result.docId && ["policy", "action", "place"].includes(result.docType))
    .map((result) => resultToMission(result, selected));
}

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
  let candidates: Mission[] = [];
  let usedMappedData = false;
  try {
    candidates = await mappedCandidates(selected, excluded, seed);
    usedMappedData = candidates.length > 0;
  } catch {
    // 검색 서버가 잠시 내려가도 준비된 MVP 미션으로 계속 사용할 수 있게 한다.
  }
  if (!candidates.length) {
    const unsure = selected.includes("unsure");
    candidates = missions.filter((mission) => !excluded.has(mission.id) && (unsure || !selected.length || mission.interestIds.some((id) => selected.includes(id))));
  }

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
      ? `${usedMappedData ? "17,000여 건의 매핑 데이터" : "준비된 후보"} 중 아직 노출이 적은 미션도 공정하게 학습할 수 있도록 탐색 추천했어요.`
      : selected.length
        ? `${usedMappedData ? "선택한 관심사에 매핑된 세부 데이터와 " : ""}같은 관심사 사용자의 완료율, 표본 불확실성, 노출 균형을 함께 반영했어요.`
        : "전체 사용자의 완료율과 노출 균형을 함께 반영했어요.",
  };
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
