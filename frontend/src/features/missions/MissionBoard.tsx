"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInterestClient, InterestClientError } from "@/features/profile/interests-client";
import { createMissionClient, MissionClientError } from "./client.ts";
import { MissionCards } from "./MissionCards";
import { MissionProgressPanel } from "./MissionProgressPanel";
import { sameMission, type CompletedMission, type MissionProgress } from "./progress.ts";
import { interestIcon } from "../profile/interest-icons.ts";
import {
  missionBoardHref,
  hasActualInterests,
  restoreLegacyContext,
  updateMissionContext,
  type MissionPane,
  type MissionPosition,
  type MissionReturnContext,
} from "./return-context.ts";

type BoardView =
  | { kind: "loading" }
  | { kind: "failed"; message: string; status?: number }
  | { kind: "ready"; hasInterests: boolean; selected: Array<{ id: string; title: string }> };

function profileError(error: unknown): { message: string; status?: number } {
  if (error instanceof InterestClientError || error instanceof MissionClientError) return {
    message: error.status === 401 ? "로그인한 뒤 관심사별 미션을 확인할 수 있어요." : error.message,
    status: error.status,
  };
  return { message: "관심사 정보를 불러오지 못했어요." };
}

export function MissionBoard({ initialContext, legacy }: {
  initialContext: MissionReturnContext;
  legacy?: MissionPosition;
}) {
  const interestClient = useMemo(() => createInterestClient(), []);
  const missionClient = useMemo(() => createMissionClient(), []);
  const [view, setView] = useState<BoardView>({ kind: "loading" });
  const [locations, setLocations] = useState<MissionReturnContext>(initialContext);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const [progressRevision, setProgressRevision] = useState(0);
  const [progress, setProgress] = useState<MissionProgress | null>(null);
  const refreshProgress = useCallback((mission: CompletedMission) => {
    setProgress(current => !current || current.completedMissions.some(done => sameMission(done, mission))
      ? current : { ...current, completedMissionCount: current.completedMissionCount + 1,
        completedMissions: [...current.completedMissions, mission] });
    setProgressRevision(value => value + 1);
  }, []);

  const acceptMission = useCallback((mission: CompletedMission) => {
    setProgress(current => !current || current.acceptedMissions.some(started => sameMission(started, mission))
      ? current : { ...current, acceptedMissions: [...current.acceptedMissions, mission] });
    setProgressRevision(value => value + 1);
  }, []);

  useEffect(() => {
    const current = ++request.current;
    const controller = new AbortController();
    interestClient.get(controller.signal).then(async profile => {
      const hasInterests = hasActualInterests(profile.interestIds);
      let basis: "selected_interests" | "catalog_exploration" | undefined;
      if (legacy) {
        const batch = await missionClient.getBatch(legacy.batchId, controller.signal);
        basis = batch.selectionBasis;
      }
      const restored = restoreLegacyContext(initialContext, legacy, basis, hasInterests);
      if (controller.signal.aborted || current !== request.current) return;
      setLocations(restored);
      setView({ kind: "ready", hasInterests,
        selected: profile.options.filter(option => profile.interestIds.includes(option.id)) });
    }).catch(error => {
      if (controller.signal.aborted || current !== request.current) return;
      const failure = profileError(error);
      setView({ kind: "failed", ...failure });
    });
    return () => controller.abort();
  }, [attempt, initialContext, interestClient, legacy, missionClient]);

  useEffect(() => {
    if (view.kind !== "ready") return;
    window.history.replaceState(window.history.state, "", missionBoardHref(locations));
  }, [locations, view.kind]);

  const updateLocation = useCallback((pane: MissionPane, position?: MissionPosition) => {
    setLocations(current => updateMissionContext(current, pane, position));
  }, []);
  const updateInterests = useCallback((position?: MissionPosition) =>
    updateLocation("interests", position), [updateLocation]);
  const updateGeneral = useCallback((position?: MissionPosition) =>
    updateLocation("general", position), [updateLocation]);

  function retryProfile() {
    setView({ kind: "loading" });
    setAttempt(value => value + 1);
  }

  if (view.kind === "loading") return <main className="[overflow-wrap:anywhere] mx-auto max-w-3xl px-5 py-12">
    <p role="status" className="rounded-2xl bg-white p-6">관심사와 미션을 불러오는 중이에요.</p>
  </main>;
  if (view.kind === "failed" && view.status === 401) return <main className="mx-auto max-w-2xl px-5 py-12"><section className="rounded-3xl bg-white p-8 text-center ring-1 ring-[#dcebd5]">
    <h1 className="text-2xl font-bold text-[#155b2d]">나에게 맞는 미션을 찾아볼까요?</h1><p className="mt-4 text-sm leading-6 text-[#61745f]">로그인하면 관심사와 실천 기록을 이어서 볼 수 있어요.</p>
    <Link href="/login?next=/missions" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#2e843b] px-6 py-3 font-bold text-white">로그인하고 미션 보기</Link>
  </section></main>;
  if (view.kind === "failed") return <main className="[overflow-wrap:anywhere] mx-auto max-w-3xl px-5 py-12">
    <section className="rounded-2xl bg-white p-6">
      <p role="alert" className="text-[#8a3825]">{view.message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {view.status === 401 && <Link href="/login?next=/missions" className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">로그인</Link>}
        <button type="button" onClick={retryProfile} className="rounded-xl border px-4 py-2 text-sm font-bold">다시 불러오기</button>
      </div>
    </section>
  </main>;

  const returnHref = missionBoardHref(locations);
  return <main className="[overflow-wrap:anywhere] mx-auto max-w-6xl px-5 py-8 sm:py-12">
    <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div>
      <p className="text-sm font-bold text-[#55a04b]">오늘의 에코미션</p>
      <h1 className="mt-2 text-3xl font-bold text-[#155b2d]">{view.hasInterests ? "오늘은 이 둘 중 하나만 해도 충분해요" : "가볍게 시작할 수 있는 미션"}</h1>
      <p className="mt-3 text-sm text-[#648462]">내 관심사와 다양한 친환경 분야의 실천을 함께 둘러보세요.</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="저장된 관심사">{view.selected.map(option => <span key={option.id} className="rounded-full bg-[#e7f5df] px-3 py-1.5 text-xs font-bold text-[#398143]"><span aria-hidden="true">{interestIcon(option.id)}</span> {option.title}</span>)}</div>
    </div><Link href="/onboarding?mode=edit" className="shrink-0 rounded-xl border border-[#b8df91] bg-white px-4 py-3 text-sm font-bold text-[#397f40]">관심사 수정</Link></header>
    <MissionProgressPanel revision={progressRevision} onProgress={setProgress} />
    <div data-mission-layout={view.hasInterests ? "dual" : "general-only"}
      className={`grid items-start gap-6 ${view.hasInterests ? "lg:grid-cols-2" : "mx-auto max-w-3xl"}`}>
      {view.hasInterests && <MissionCards pane="interests" mode="interests" title="내 관심사 기반"
        description="저장한 관심사와 연결된 프로그램을 모았어요."
        initialPosition={locations.interests} returnHref={returnHref}
        onLocationChange={updateInterests} onCompleted={refreshProgress} onAccepted={acceptMission}
        acceptedMissions={progress?.acceptedMissions ?? null} completedMissions={progress?.completedMissions ?? null} />}
      <MissionCards pane="general" mode="general" title="새로운 친환경 실천 추천"
        description="관심사와 관계없이 여러 분야의 프로그램을 둘러보세요."
        initialPosition={locations.general} returnHref={returnHref}
        onLocationChange={updateGeneral} onCompleted={refreshProgress} onAccepted={acceptMission}
        acceptedMissions={progress?.acceptedMissions ?? null} completedMissions={progress?.completedMissions ?? null} />
    </div>
  </main>;
}
