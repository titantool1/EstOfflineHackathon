"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { SiteHeader } from "@/features/layout/site-header";
import type { MissionEventType, RecommendationResponse } from "@/features/missions/analytics";
import { findInterest, isInterestId, type InterestId, type Mission } from "@/features/missions/catalog";
import { getCompletedMissionIdsToday, recordMissionCompletion } from "@/features/missions/practice-record";

const interestStorageKey = "eco_interests_v2";
const userStorageKey = "eco_anonymous_user_v1";
const dailyMissionGoal = 5;

type Slot = "interest" | "outside";

function makeId() {
  return crypto.randomUUID();
}

function MissionCard({ mission, reason, outside, detailsOpen, accepted, completed, selfVerified, photoName, onAccept, onSelfVerify, onPhotoSubmit, onComplete, onNext }: {
  mission: Mission;
  reason: string;
  outside: boolean;
  detailsOpen: boolean;
  accepted: boolean;
  completed: boolean;
  selfVerified: boolean;
  photoName?: string;
  onAccept: () => void;
  onSelfVerify: (checked: boolean) => void;
  onPhotoSubmit: (file: File) => void;
  onComplete: () => void;
  onNext: () => void;
}) {
  return <article className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfead9] sm:p-7">
    <div className="flex items-start justify-between gap-4"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e9] text-3xl">{mission.icon}</span><span className="rounded-full bg-[#f1f7ed] px-3 py-1.5 text-xs font-bold text-[#588457]">⏱ {mission.duration}</span></div>
    <div className="mt-5 flex flex-wrap gap-2"><span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${outside ? "bg-[#fff2c9] text-[#9a7214]" : "bg-[#e7f5df] text-[#398143]"}`}>{outside ? "관심사 밖 · 새 분야" : "내 관심사 기반"}</span>{mission.verificationStatus === "verified" && <span className="rounded-lg bg-[#ecf8e8] px-3 py-1.5 text-xs font-bold text-[#438947]">확인됨</span>}</div>
    <h2 className="mt-5 text-2xl font-bold leading-tight text-[#1b5930]">{mission.title}</h2>
    <p className="mt-3 text-sm leading-6 text-[#618060]">{mission.summary}</p>
    <div className="mt-5 rounded-2xl bg-[#f1f8ea] p-4"><p className="text-xs font-bold text-[#4d9849]">연결 혜택</p><p className="mt-1 text-sm leading-6 text-[#427243]">{mission.benefit}</p></div>
    {detailsOpen && <div className="mt-5 rounded-2xl border border-[#e0edd9] p-4"><p className="text-sm font-bold text-[#315f33]">이렇게 해보세요</p><ol className="mt-3 space-y-2 text-sm leading-6 text-[#5d755b]">{mission.howTo.map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3d913e] text-xs font-bold text-white">{index + 1}</span>{step}</li>)}</ol>{mission.sourceUrl && <a href={mission.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-xs font-bold text-[#3d813f] underline underline-offset-4">공식 출처 확인 ↗</a>}</div>}
    {completed ? <div className="mt-5 rounded-2xl bg-[#e7f6df] p-4 text-center text-sm font-bold text-[#2d7b38]">✓ 오늘의 미션 완료를 기록했어요</div> : !accepted ? <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onAccept} className="cursor-pointer rounded-xl bg-[#2e843b] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#236e30]">이 미션 하기</button><button type="button" onClick={onNext} className="cursor-pointer rounded-xl border border-[#b8df91] px-4 py-3.5 text-sm font-bold text-[#397f40] transition hover:bg-[#f4faef]">다른 미션 보기</button></div> : mission.requiresPhotoProof ? photoName ? <div className="mt-5 rounded-2xl border border-[#f2d584] bg-[#fff8e5] p-4"><p className="text-sm font-bold text-[#916715]">📷 인증샷 심사중</p><p className="mt-1 text-sm leading-6 text-[#866f40]">운영진 확인 뒤 완료 처리됩니다. 심사 전에는 완료로 기록되지 않아요.</p><p className="mt-2 truncate text-xs font-medium text-[#9b814b]">첨부: {photoName}</p><button type="button" onClick={onNext} className="mt-4 w-full cursor-pointer rounded-xl border border-[#d9bb62] bg-white px-4 py-3 text-sm font-bold text-[#80601d] transition hover:bg-[#fffdf5]">다른 미션 보기</button></div> : <div className="mt-5 rounded-2xl border border-[#e6eddc] bg-[#fbfdf9] p-4"><p className="text-sm font-bold text-[#315f33]">사진 인증이 필요한 미션이에요</p><p className="mt-1 text-sm leading-6 text-[#667d63]">실천한 장소나 결과가 보이게 인증샷 1장을 올려 주세요. 운영진이 확인한 뒤 완료 처리해요.</p><label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl bg-[#2e843b] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#236e30]">인증샷 업로드<input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) onPhotoSubmit(file); }} /></label><button type="button" onClick={onNext} className="mt-3 w-full cursor-pointer rounded-xl border border-[#b8df91] px-4 py-3 text-sm font-bold text-[#397f40] transition hover:bg-[#f4faef]">다른 미션 보기</button></div> : <div className="mt-5 rounded-2xl border border-[#e6eddc] bg-[#fbfdf9] p-4"><label className="flex cursor-pointer items-start gap-3 text-sm font-semibold leading-6 text-[#436943]"><input type="checkbox" checked={selfVerified} onChange={(event) => onSelfVerify(event.target.checked)} className="mt-1 h-4 w-4 accent-[#2e843b]" />위 실천 내용을 확인했고 수행했어요</label><p className="mt-2 text-xs leading-5 text-[#7d9279]">사진이 필요 없는 미션은 간단한 자기 확인 후 완료를 기록합니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" disabled={!selfVerified} onClick={onComplete} className="cursor-pointer rounded-xl bg-[#2e843b] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#236e30] disabled:cursor-not-allowed disabled:bg-[#b8cfb4]">완료 기록하기</button><button type="button" onClick={onNext} className="cursor-pointer rounded-xl border border-[#b8df91] px-4 py-3.5 text-sm font-bold text-[#397f40] transition hover:bg-[#f4faef]">다른 미션 보기</button></div></div>}
    <p className="mt-auto border-t border-[#edf2e9] pt-5 text-xs leading-5 text-[#80917d]">추천 이유: {reason}</p>
  </article>;
}

export default function MissionsPage() {
  const [interestMission, setInterestMission] = useState<Mission | null>(null);
  const [outsideMission, setOutsideMission] = useState<Mission | null>(null);
  const [interestReason, setInterestReason] = useState("");
  const [outsideReason, setOutsideReason] = useState("");
  const [interestIds, setInterestIds] = useState<InterestId[]>([]);
  const [loading, setLoading] = useState<Record<Slot, boolean>>({ interest: true, outside: false });
  const [error, setError] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [selfVerifiedIds, setSelfVerifiedIds] = useState<Set<string>>(new Set());
  const [photoSubmissions, setPhotoSubmissions] = useState<Record<string, string>>({});
  const [trackingWarning, setTrackingWarning] = useState(false);

  const profileRef = useRef({ userId: "", sessionId: "", interestIds: [] as InterestId[], algorithmVersion: "interest-funnel-v1" });
  const sequenceRef = useRef(0);
  const seenRef = useRef<Record<Slot, string[]>>({ interest: [], outside: [] });
  const impressedRef = useRef(new Set<string>());

  const recordEvent = useCallback(async (eventType: MissionEventType, mission: Mission | null) => {
    if (!mission || !profileRef.current.userId) return;
    sequenceRef.current += 1;
    try {
      const response = await fetch("/api/missions/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientEventId: makeId(), anonymousUserId: profileRef.current.userId, recommendationSessionId: profileRef.current.sessionId, missionId: mission.id, missionTitle: mission.title, eventType, interestSnapshot: profileRef.current.interestIds, sequenceNumber: sequenceRef.current, algorithmVersion: profileRef.current.algorithmVersion, occurredAt: new Date().toISOString() }) });
      if (!response.ok) throw new Error("tracking_failed");
    } catch { setTrackingWarning(true); }
  }, []);

  const loadRecommendation = useCallback(async (slot: Slot, excluded: string[]) => {
    setLoading((current) => ({ ...current, [slot]: true }));
    setError("");
    try {
      const params = new URLSearchParams({ interests: profileRef.current.interestIds.join(","), exclude: excluded.join(","), seed: `${profileRef.current.sessionId}:${slot}:${excluded.length}`, scope: slot === "outside" ? "outside" : "interest" });
      const response = await fetch(`/api/missions/recommendations?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("recommendation_failed");
      const data = await response.json() as RecommendationResponse;
      profileRef.current.algorithmVersion = data.algorithmVersion;
      if (slot === "interest") { setInterestMission(data.mission); setInterestReason(data.reason); } else { setOutsideMission(data.mission); setOutsideReason(data.reason); }
    } catch { setError("추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally { setLoading((current) => ({ ...current, [slot]: false })); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let selected: InterestId[] = [];
      try { const stored = JSON.parse(localStorage.getItem(interestStorageKey) ?? "[]"); if (Array.isArray(stored)) selected = [...new Set(stored.filter((item): item is InterestId => typeof item === "string" && isInterestId(item)))]; } catch { localStorage.removeItem(interestStorageKey); }
      let userId = localStorage.getItem(userStorageKey);
      if (!userId) { userId = makeId(); localStorage.setItem(userStorageKey, userId); }
      profileRef.current = { userId, sessionId: makeId(), interestIds: selected, algorithmVersion: "interest-funnel-v1" };
      setInterestIds(selected);
      void loadRecommendation("interest", []);
      if (selected.length) void loadRecommendation("outside", []);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRecommendation]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCompletedIds(getCompletedMissionIdsToday()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    [interestMission, outsideMission].forEach((mission) => {
      if (!mission || impressedRef.current.has(mission.id)) return;
      impressedRef.current.add(mission.id);
      void recordEvent("impression", mission);
    });
  }, [interestMission, outsideMission, recordEvent]);

  const missionFor = (slot: Slot) => slot === "interest" ? interestMission : outsideMission;
  const acceptMission = (mission: Mission) => { void recordEvent("view", mission); void recordEvent("accept", mission); setAcceptedIds((current) => new Set(current).add(mission.id)); setOpenIds((current) => new Set(current).add(mission.id)); };
  const completeMission = (mission: Mission) => { void recordEvent("complete", mission); recordMissionCompletion(mission.id); setCompletedIds((current) => new Set(current).add(mission.id)); };
  const setSelfVerified = (mission: Mission, checked: boolean) => setSelfVerifiedIds((current) => { const next = new Set(current); if (checked) next.add(mission.id); else next.delete(mission.id); return next; });
  const submitPhoto = (mission: Mission, file: File) => { setPhotoSubmissions((current) => ({ ...current, [mission.id]: file.name })); setOpenIds((current) => new Set(current).add(mission.id)); };
  const nextMission = (slot: Slot) => { const mission = missionFor(slot); if (!mission) return; if (!completedIds.has(mission.id)) void recordEvent("skip", mission); const nextSeen = [...seenRef.current[slot], mission.id]; seenRef.current[slot] = nextSeen; void loadRecommendation(slot, nextSeen); };

  const completionRate = Math.min(100, Math.round((completedIds.size / dailyMissionGoal) * 100));
  const hasInterests = interestIds.length > 0;
  const renderCard = (slot: Slot) => {
    const mission = missionFor(slot);
    if (loading[slot]) return <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-[#e5ece0]"><div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-[#dcefd5]" /><p className="mt-5 text-sm font-semibold text-[#668165]">미션을 고르는 중이에요…</p></div>;
    if (!mission) return <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-[#e5ece0]"><p className="text-3xl">👏</p><p className="mt-4 text-sm font-semibold text-[#668165]">지금은 새 미션이 없어요.</p></div>;
    return <MissionCard mission={mission} reason={slot === "interest" ? interestReason : outsideReason} outside={slot === "outside"} detailsOpen={openIds.has(mission.id)} accepted={acceptedIds.has(mission.id)} completed={completedIds.has(mission.id)} selfVerified={selfVerifiedIds.has(mission.id)} photoName={photoSubmissions[mission.id]} onAccept={() => acceptMission(mission)} onSelfVerify={(checked) => setSelfVerified(mission, checked)} onPhotoSubmit={(file) => submitPhoto(mission, file)} onComplete={() => completeMission(mission)} onNext={() => nextMission(slot)} />;
  };

  return <div className="min-h-screen bg-[#f5f8f1]"><SiteHeader active="missions" />
    <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-bold text-[#55a04b]">오늘의 에코미션</p><h1 className="mt-2 text-3xl font-bold text-[#155b2d]">오늘은 이 둘 중 하나만 해도 충분해요</h1><p className="mt-3 text-sm text-[#648462]">내 관심사와 새로운 친환경 분야를 함께 추천해 드려요.</p></div><Link href="/onboarding?mode=edit" className="rounded-xl border border-[#b8df91] bg-white px-4 py-3 text-sm font-bold text-[#397f40]">관심사 수정</Link></section>
      <section className="mt-7 rounded-3xl bg-[#2e843b] p-6 text-white shadow-sm sm:p-8"><div className="flex items-start justify-between gap-5"><div><p className="text-2xl font-bold">오늘 {completedIds.size} / {dailyMissionGoal} 완료 · 달성률 {completionRate}%</p><p className="mt-2 text-sm text-[#d5efc8]">미션을 완료하면 오늘의 실천 기록에 반영돼요.</p></div><span className="text-4xl" aria-hidden="true">🌱</span></div><div className="mt-6 h-3 overflow-hidden rounded-full bg-[#5ca947]"><div className="h-full rounded-full bg-[#ffc431] transition-all" style={{ width: `${completionRate}%` }} /></div></section>
      {error && <div className="mt-6 rounded-2xl bg-[#fff4f0] p-4 text-sm font-semibold text-[#a34f3e]">{error}</div>}
      {hasInterests ? <section className="mt-9 grid items-stretch gap-7 lg:grid-cols-2"><div className="flex flex-col"><div className="mb-4 min-h-[84px]"><p className="text-sm font-bold text-[#2f843d]">내 관심사 기반</p><h2 className="mt-1 text-xl font-bold text-[#1d5931]">{interestIds.map((id) => findInterest(id)?.title).filter(Boolean).join(" · ")}에서</h2><p className="mt-1 text-sm text-[#65a64f]">관심사로 고른 분야에서 추천해요.</p></div>{renderCard("interest")}</div><div className="flex flex-col"><div className="mb-4 min-h-[84px]"><p className="text-sm font-bold text-[#a77a13]">관심사 밖 · 새 분야</p><h2 className="mt-1 text-xl font-bold text-[#1d5931]">새로운 친환경 실천 추천</h2><p className="mt-1 text-sm text-[#65a64f]">선택하지 않았지만 함께 알아두면 좋은 미션이에요.</p></div>{renderCard("outside")}</div></section> : <section className="mx-auto mt-9 max-w-2xl"><div className="mb-4"><p className="text-sm font-bold text-[#2f843d]">오늘의 추천</p><h2 className="mt-1 text-xl font-bold text-[#1d5931]">가볍게 시작할 수 있는 미션</h2></div>{renderCard("interest")}</section>}
      {trackingWarning && <p className="mt-5 text-center text-xs text-[#a27131]">화면은 사용할 수 있지만 일부 기록 저장에 실패했어요.</p>}
    </main>
  </div>;
}
