"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInterestClient, InterestClientError } from "@/features/profile/interests-client";
import { createMissionClient, MissionClientError } from "./client.ts";
import { MissionCards } from "./MissionCards";
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
  | { kind: "ready"; hasInterests: boolean };

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
      setView({ kind: "ready", hasInterests });
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
  if (view.kind === "failed") return <main className="[overflow-wrap:anywhere] mx-auto max-w-3xl px-5 py-12">
    <section className="rounded-2xl bg-white p-6">
      <p role="alert" className="text-[#8a3825]">{view.message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {view.status === 401 && <Link href="/login" className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">로그인</Link>}
        <button type="button" onClick={retryProfile} className="rounded-xl border px-4 py-2 text-sm font-bold">다시 불러오기</button>
      </div>
    </section>
  </main>;

  const returnHref = missionBoardHref(locations);
  return <main className="[overflow-wrap:anywhere] mx-auto max-w-7xl px-5 py-8 sm:py-12">
    <header className="mb-7 rounded-3xl bg-[#e9f6e4] p-6 sm:p-8">
      <p className="text-sm font-bold text-[#40883f]">내 미션 둘러보기</p>
      <h1 className="mt-2 text-3xl font-bold text-[#284527]">익숙한 관심사와 새로운 실천을 함께 살펴보세요</h1>
      <p className="mt-3 text-sm leading-6 text-[#61745f]">각 영역은 따로 이동하고 새 묶음을 받을 수 있어요.</p>
    </header>
    <div data-mission-layout={view.hasInterests ? "dual" : "general-only"}
      className={`grid items-start gap-6 ${view.hasInterests ? "lg:grid-cols-2" : "mx-auto max-w-3xl"}`}>
      {view.hasInterests && <MissionCards pane="interests" mode="interests" title="내 관심사 미션"
        description="저장한 관심사와 연결된 프로그램을 모았어요."
        initialPosition={locations.interests} returnHref={returnHref}
        onLocationChange={updateInterests} />}
      <MissionCards pane="general" mode="general" title="새롭게 둘러보는 미션"
        description="관심사와 관계없이 여러 분야의 프로그램을 둘러보세요."
        initialPosition={locations.general} returnHref={returnHref}
        onLocationChange={updateGeneral} />
    </div>
  </main>;
}
