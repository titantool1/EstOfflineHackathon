"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MissionEventType, RecommendationResponse } from "@/features/missions/analytics";
import { findInterest, isInterestId, type InterestId, type Mission } from "@/features/missions/catalog";

const interestStorageKey = "eco_interests_v2";
const userStorageKey = "eco_anonymous_user_v1";

function makeId() {
  return crypto.randomUUID();
}

export default function MissionsPage() {
  const [mission, setMission] = useState<Mission | null>(null);
  const [interestIds, setInterestIds] = useState<InterestId[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [trackingWarning, setTrackingWarning] = useState(false);

  const profileRef = useRef({ userId: "", sessionId: "", interestIds: [] as InterestId[], algorithmVersion: "interest-funnel-v1" });
  const sequenceRef = useRef(0);
  const seenRef = useRef<string[]>([]);
  const impressedRef = useRef(new Set<string>());
  const viewedRef = useRef(new Set<string>());

  const recordEvent = useCallback(async (eventType: MissionEventType, targetMission: Mission | null) => {
    if (!targetMission || !profileRef.current.userId) return;
    sequenceRef.current += 1;
    try {
      const response = await fetch("/api/missions/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientEventId: makeId(),
          anonymousUserId: profileRef.current.userId,
          recommendationSessionId: profileRef.current.sessionId,
          missionId: targetMission.id,
          missionTitle: targetMission.title,
          eventType,
          interestSnapshot: profileRef.current.interestIds,
          sequenceNumber: sequenceRef.current,
          algorithmVersion: profileRef.current.algorithmVersion,
          occurredAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error("tracking_failed");
    } catch {
      setTrackingWarning(true);
    }
  }, []);

  const loadRecommendation = useCallback(async (excluded: string[]) => {
    setLoading(true);
    setError("");
    setDetailsOpen(false);
    setAccepted(false);
    setCompleted(false);
    try {
      const params = new URLSearchParams({
        interests: profileRef.current.interestIds.join(","),
        exclude: excluded.join(","),
        seed: `${profileRef.current.sessionId}:${excluded.length}`,
      });
      const response = await fetch(`/api/missions/recommendations?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("recommendation_failed");
      const data = await response.json() as RecommendationResponse;
      profileRef.current.algorithmVersion = data.algorithmVersion;
      setMission(data.mission);
      setReason(data.reason);
    } catch {
      setMission(null);
      setError("추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let selected: InterestId[] = [];
      try {
        const stored = JSON.parse(localStorage.getItem(interestStorageKey) ?? "[]");
        if (Array.isArray(stored)) selected = [...new Set(stored.filter((item): item is InterestId => typeof item === "string" && isInterestId(item)))];
      } catch {
        localStorage.removeItem(interestStorageKey);
      }

      let userId = localStorage.getItem(userStorageKey);
      if (!userId) {
        userId = makeId();
        localStorage.setItem(userStorageKey, userId);
      }
      profileRef.current = { userId, sessionId: makeId(), interestIds: selected, algorithmVersion: "interest-funnel-v1" };
      setInterestIds(selected);
      void loadRecommendation([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRecommendation]);

  useEffect(() => {
    if (!mission || impressedRef.current.has(mission.id)) return;
    impressedRef.current.add(mission.id);
    void recordEvent("impression", mission);
  }, [mission, recordEvent]);

  const showDetails = () => {
    if (!mission) return;
    setDetailsOpen(true);
    if (!viewedRef.current.has(mission.id)) {
      viewedRef.current.add(mission.id);
      void recordEvent("view", mission);
    }
  };

  const chooseMission = async () => {
    if (!mission) return;
    await recordEvent("accept", mission);
    setAccepted(true);
    setDetailsOpen(true);
  };

  const completeMission = async () => {
    if (!mission) return;
    await recordEvent("complete", mission);
    setCompleted(true);
  };

  const nextMission = async () => {
    if (!mission) return;
    if (!completed) await recordEvent("skip", mission);
    const nextSeen = [...seenRef.current, mission.id];
    seenRef.current = nextSeen;
    await loadRecommendation(nextSeen);
  };

  const restart = () => {
    seenRef.current = [];
    impressedRef.current.clear();
    viewedRef.current.clear();
    profileRef.current.sessionId = makeId();
    sequenceRef.current = 0;
    void loadRecommendation([]);
  };

  return (
    <div className="min-h-screen bg-[#f5f8f1]">
      <header className="border-b border-[#e5eddc] bg-white/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
          <nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions" className="font-bold text-[#287b39]">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat">줍줍이 챗봇</Link></nav>
          <Link href="/missions/insights" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">📊 실험 현황</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8 md:py-12">
        <section className="rounded-3xl bg-[#e9f6e4] p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#40883f]">한 번에 하나씩 추천</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">지금 할 미션을 골라볼까요?</h1>
              <p className="mt-3 text-sm leading-6 text-[#638060]">카드를 실제로 본 순간부터 선택·완료까지 익명으로 기록해 추천을 개선해요.</p>
            </div>
            <Link href="/onboarding" className="shrink-0 rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-[#347b3d] shadow-sm">관심사 다시 선택</Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {interestIds.length ? interestIds.map((id) => {
              const interest = findInterest(id);
              return interest ? <span key={id} className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#477445]">{interest.icon} {interest.title}</span> : null;
            }) : <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#477445]">🌿 전체 관심사</span>}
          </div>
        </section>

        <section className="mx-auto mt-7 max-w-2xl" aria-live="polite">
          {loading ? (
            <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-[#e5ece0]"><div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-[#dcefd5]" /><p className="mt-5 text-sm font-semibold text-[#668165]">관심사에 맞는 미션을 고르는 중이에요…</p></div>
          ) : error ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#eeded7]"><p className="text-sm font-semibold text-[#a34f3e]">{error}</p><button type="button" onClick={() => void loadRecommendation(seenRef.current)} className="mt-5 rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">다시 시도</button></div>
          ) : mission ? (
            <article className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e5ece0]">
              <div className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf7e9] text-3xl">{mission.icon}</div>
                  <span className="rounded-full bg-[#f4f7f2] px-3 py-1.5 text-xs font-bold text-[#688066]">{mission.duration}</span>
                </div>
                <p className="mt-6 text-xs font-bold text-[#5b9d51]">추천 미션 · {mission.interestIds.map((id) => findInterest(id)?.title).filter(Boolean).join(" · ")}</p>
                <h2 className="mt-2 text-2xl font-bold text-[#29452a]">{mission.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#667d65]">{mission.summary}</p>

                {detailsOpen && (
                  <div className="mt-6 rounded-2xl bg-[#f7faf5] p-5">
                    <p className="text-sm font-bold text-[#315f33]">이렇게 해보세요</p>
                    <ol className="mt-3 space-y-2 text-sm text-[#637661]">
                      {mission.howTo.map((step, index) => <li key={step} className="flex gap-3"><span className="font-bold text-[#4d9a49]">{index + 1}</span><span>{step}</span></li>)}
                    </ol>
                    <div className="mt-5 border-t border-[#e3ebdf] pt-4">
                      <p className="text-xs font-bold text-[#5b9d51]">연결 혜택</p>
                      <p className="mt-1 text-sm leading-6 text-[#576d56]">{mission.benefit}</p>
                      {mission.sourceDocId && <p className="mt-3 text-xs text-[#70806e]">데이터 ID · {mission.sourceDocId}</p>}
                      {mission.sourceUrl && <a href={mission.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-bold text-[#3f8245] underline underline-offset-4">공식·원본 출처 확인 ↗</a>}
                      {mission.verificationStatus === "needs-review" && <p className="mt-2 text-xs text-[#9a7627]">※ MVP 임시 매핑입니다. 실제 제공처·조건은 최종 데이터 확인이 필요해요.</p>}
                    </div>
                  </div>
                )}

                {completed ? (
                  <div className="mt-7 rounded-2xl bg-[#e9f7e4] p-5 text-center"><p className="text-2xl">🎉</p><p className="mt-2 font-bold text-[#2e7438]">미션 완료를 기록했어요!</p><p className="mt-1 text-xs text-[#668165]">같은 관심사 그룹의 추천 성과에 반영됩니다.</p></div>
                ) : (
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {!accepted ? <button type="button" onClick={() => void chooseMission()} className="rounded-xl bg-[#2f843d] py-3.5 text-sm font-bold text-white hover:bg-[#267335]">이 미션 하기</button> : <button type="button" onClick={() => void completeMission()} className="rounded-xl bg-[#2f843d] py-3.5 text-sm font-bold text-white hover:bg-[#267335]">✓ 실제로 완료했어요</button>}
                    <button type="button" onClick={() => void nextMission()} className="rounded-xl bg-[#eef5ea] py-3.5 text-sm font-bold text-[#3e7942] hover:bg-[#e3f0dd]">다음 미션 →</button>
                  </div>
                )}

                <div className="mt-3 flex flex-col items-center justify-between gap-2 sm:flex-row">
                  {!detailsOpen && <button type="button" onClick={showDetails} className="px-3 py-2 text-xs font-bold text-[#5d7f5d] underline underline-offset-4">자세히 확인하기</button>}
                  {detailsOpen && !completed && <Link href="/chat" className="px-3 py-2 text-xs font-bold text-[#5d7f5d] underline underline-offset-4">이 미션을 챗봇에 물어보기</Link>}
                  {completed && <button type="button" onClick={() => void nextMission()} className="rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">다음 추천 받기 →</button>}
                </div>
              </div>
              <div className="border-t border-[#edf1ea] bg-[#fbfcfa] px-6 py-4 text-xs leading-5 text-[#758773]">추천 이유: {reason}</div>
            </article>
          ) : (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#e5ece0]"><p className="text-3xl">👏</p><h2 className="mt-4 text-xl font-bold">준비한 미션을 모두 확인했어요</h2><p className="mt-2 text-sm text-[#6d806b]">새 추천 세션을 시작하면 다시 비교해볼 수 있어요.</p><button type="button" onClick={restart} className="mt-5 rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">처음부터 다시 추천</button></div>
          )}
          {trackingWarning && <p className="mt-4 text-center text-xs text-[#a27131]">화면은 사용할 수 있지만 일부 실험 이벤트 저장에 실패했어요.</p>}
        </section>
      </main>
    </div>
  );
}
