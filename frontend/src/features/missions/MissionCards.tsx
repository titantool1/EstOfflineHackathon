"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { MissionPhotoToggle } from "./photo/MissionPhotoToggle";
import { MissionInformation } from "./MissionInformation";
import { actionDescription } from "./action-descriptions.ts";
import { programSummary } from "./program-summaries.ts";
import { SourceText } from "@/features/sources/SourceText";
import { interestIcon } from "../profile/interest-icons.ts";
import { createMissionClient, MissionClientError } from "./client.ts";
import type { MissionEventInput, MissionRecommendationItem } from "./contract.ts";
import { sameMission, type CompletedMission } from "./progress.ts";
import {
  initialMissionViewState,
  missionEventInput,
  missionViewReducer,
} from "./state.ts";
import { matchesMissionPane, missionRouteHref, type MissionPane, type MissionPosition } from "./return-context.ts";

type Source =
  | { kind: "batch"; batchId: string; itemId?: string }
  | { kind: "recommend"; input: { clientRequestId: string; mode: "interests" | "general" } };
type EventStatus = { kind: "sending" | "recorded" | "failed"; message?: string };

const newId = () => crypto.randomUUID();
const eventLabel: Record<MissionEventInput["eventType"], string> = {
  impression: "카드 노출",
  detail_view: "상세 조회",
  accepted: "도전 선택",
  self_reported_completed: "실천 기록",
  map_open: "장소 조회",
  route_open: "길찾기 조회",
};

function loadMessage(error: unknown): string {
  if (error instanceof MissionClientError) {
    if (error.status === 401) return "로그인한 뒤 내 관심사에 맞는 미션을 확인할 수 있어요.";
    return error.message;
  }
  return "미션을 불러오지 못했어요.";
}

function EventFailure({ label, retry }: { label: string; retry: () => void }) {
  return <p role="alert" className="mt-3 rounded-xl bg-[#fff4ed] px-3 py-2 text-xs text-[#9a4727]">
    {label}을 저장하지 못했어요. <button type="button" onClick={retry} className="font-bold underline">같은 기록으로 다시 시도</button>
  </p>;
}

function MissionCard({ item, batchId, position, total, paneTitle, returnHref, status, record, completionKnown, alreadyCompleted }: {
  item: MissionRecommendationItem;
  batchId: string;
  position: number;
  total: number;
  paneTitle: string;
  returnHref: string;
  status: (type: MissionEventInput["eventType"]) => EventStatus | undefined;
  record: (type: MissionEventInput["eventType"]) => void;
  completionKnown: boolean;
  alreadyCompleted: boolean;
}) {
  const [selfVerified, setSelfVerified] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const inViewport = useRef(false);

  useEffect(() => {
    const node = articleRef.current;
    if (!node) return;
    const tryImpression = () => {
      if (inViewport.current && document.visibilityState === "visible") record("impression");
    };
    const observer = new IntersectionObserver(entries => {
      inViewport.current = Boolean(entries[0]?.isIntersecting);
      tryImpression();
    }, { threshold: 0 });
    const onVisibility = () => tryImpression();
    observer.observe(node);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      inViewport.current = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [item.itemId, record]);

  const accepted = status("accepted");
  const completed = status("self_reported_completed");
  const impression = status("impression");
  const missionPosition = { batchId, itemId: item.itemId };
  const action = actionDescription(item.programKey, item.actionId);
  const title = action?.title ?? item.programTitle;
  const summary = action?.summary ?? programSummary(item.programKey);
  return <article ref={articleRef} aria-label={`${paneTitle} 추천 미션 ${position + 1}: ${title}`}
    className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfead9] sm:p-7">
    <div className="flex items-start justify-between gap-4"><span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e9] text-3xl">{interestIcon(item.matchedInterestIds[0])}</span><span className="rounded-full bg-[#f1f7ed] px-3 py-1.5 text-xs font-bold text-[#588457]">추천 {position + 1} / {total}</span></div>
    <div className="mt-5 flex flex-wrap gap-2"><span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${item.matchedInterestIds.length ? "bg-[#e7f5df] text-[#398143]" : "bg-[#fff2c9] text-[#9a7214]"}`}>{item.matchedInterestIds.length ? "내 관심사 기반" : "일반 추천 · 새롭게 둘러보기"}</span></div>
    <h2 className="mt-5 text-2xl font-bold leading-tight text-[#1b5930]">{title}</h2>
    {action && <p className="mt-2 text-xs text-[#71816f]">연결 제도 · {item.programTitle}</p>}
    <p className="mt-3 text-sm leading-6 text-[#618060]">{summary ?? <SourceText text={item.programSummary} />}</p>
    <MissionInformation batchId={batchId} itemId={item.itemId} />
    {alreadyCompleted || completed?.kind === "recorded" ? <div role="status" className="mt-5 rounded-2xl bg-[#e7f6df] p-4 text-center text-sm font-bold text-[#2d7b38]">✓ 실천 완료</div> : accepted?.kind !== "recorded" ?
      <button type="button" onClick={() => record("accepted")} disabled={!completionKnown || accepted?.kind === "sending"} className="mt-5 min-h-12 rounded-xl bg-[#2e843b] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#236e30] disabled:opacity-60">{!completionKnown ? "실천 기록 확인 필요" : accepted?.kind === "sending" ? "저장 중…" : "이 미션 하기"}</button> :
      <div className="mt-5 rounded-2xl border border-[#e6eddc] bg-[#fbfdf9] p-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm font-semibold leading-6 text-[#436943]"><input type="checkbox" checked={selfVerified} disabled={completed?.kind === "sending"} onChange={event => setSelfVerified(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#2e843b]" />위 실천 내용을 확인했고 수행했어요</label>
        <button type="button" onClick={() => record("self_reported_completed")} disabled={!completionKnown || !selfVerified || completed?.kind === "sending"} className="mt-4 min-h-12 w-full rounded-xl bg-[#2e843b] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#236e30] disabled:bg-[#b8cfb4]">{completed?.kind === "sending" ? "저장 중…" : "완료 기록하기"}</button>
      </div>}
    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
      <Link href={missionRouteHref("/chat", missionPosition, returnHref)} className="inline-flex min-h-11 items-center text-xs font-bold text-[#5d7f5d] underline underline-offset-4">이 미션을 챗봇에 물어보기</Link>
      {item.relatedPlaceCount > 0 && <Link href={missionRouteHref("/map/mission", missionPosition, returnHref)} aria-label={`${title} 관련 장소 보기`} className="inline-flex min-h-11 items-center text-xs font-bold text-[#5d7f5d] underline">관련 장소 {item.relatedPlaceCount}곳 보기</Link>}
    </div>
    <MissionPhotoToggle actionId={item.actionId} />
    <p className="mt-5 border-t border-[#edf2e9] pt-4 text-xs leading-5 text-[#71816f]">실천 기록은 본인의 자기보고예요. 자격을 자동 판정하거나 공식 완료·포인트 지급을 보장하지 않아요.</p>
    {impression?.kind === "failed" && <EventFailure label={eventLabel.impression} retry={() => record("impression")} />}
    {accepted?.kind === "failed" && <EventFailure label={eventLabel.accepted} retry={() => record("accepted")} />}
    {completed?.kind === "failed" && <EventFailure label={eventLabel.self_reported_completed} retry={() => record("self_reported_completed")} />}
  </article>;
}

export function MissionCards({ pane, mode, title, description, initialPosition, returnHref, onLocationChange, onCompleted, onAccepted, acceptedMissions, completedMissions }: {
  pane: MissionPane;
  mode: "interests" | "general";
  title: string;
  description: string;
  initialPosition?: MissionPosition;
  returnHref: string;
  onLocationChange: (position?: MissionPosition) => void;
  onCompleted: (mission: CompletedMission) => void;
  onAccepted: (mission: CompletedMission) => void;
  acceptedMissions: CompletedMission[] | null;
  completedMissions: CompletedMission[] | null;
}) {
  const client = useMemo(() => createMissionClient(), []);
  const [source, setSource] = useState<Source>(() => initialPosition
    ? { kind: "batch", batchId: initialPosition.batchId, itemId: initialPosition.itemId }
    : { kind: "recommend", input: { clientRequestId: newId(), mode } });
  const [state, dispatch] = useReducer(missionViewReducer, initialMissionViewState);
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const eventInputs = useRef(new Map<string, MissionEventInput>());
  const eventRecorded = useRef(new Set<string>());
  const eventInFlight = useRef(new Set<string>());
  const [eventStatuses, setEventStatuses] = useState<Record<string, EventStatus>>({});

  useEffect(() => {
    const current = ++request.current;
    const controller = new AbortController();
    dispatch({ type: "begin", request: current });
    const task = source.kind === "batch"
      ? client.getBatch(source.batchId, controller.signal)
      : client.recommend(source.input, controller.signal);
    task.then(batch => {
      if (controller.signal.aborted || current !== request.current) return;
      if (!matchesMissionPane(pane, batch.selectionBasis)) {
        onLocationChange(undefined);
        dispatch({ type: "failed", request: current, message: "이 주소의 추천 묶음이 현재 영역과 맞지 않아요." });
        return;
      }
      dispatch({ type: "loaded", request: current, batch, itemId: source.kind === "batch" ? source.itemId : undefined });
    }).catch(error => {
      if (controller.signal.aborted || current !== request.current) return;
      dispatch({ type: "failed", request: current, message: loadMessage(error),
        status: error instanceof MissionClientError ? error.status : undefined });
    });
    return () => controller.abort();
  }, [client, mode, onLocationChange, pane, retry, source]);

  const active = state.kind === "ready" ? state.batch.items[state.index] : null;
  useEffect(() => {
    if (!active || state.kind !== "ready") return;
    onLocationChange({ batchId: state.batch.batchId, itemId: active.itemId });
  }, [active, onLocationChange, state]);

  const record = useCallback((type: MissionEventInput["eventType"]) => {
    if (!active || state.kind !== "ready") return;
    if ((type === "accepted" || type === "self_reported_completed")
        && (!completedMissions || completedMissions.some(done => sameMission(done, active)))) return;
    if (type === "accepted" && (!acceptedMissions || acceptedMissions.some(started => sameMission(started, active)))) return;
    const key = `${state.batch.batchId}:${active.itemId}:${type}`;
    if (eventRecorded.current.has(key) || eventInFlight.current.has(key)) return;
    let input = eventInputs.current.get(key);
    if (!input) {
      input = missionEventInput(state.batch.batchId, active.itemId, type, newId(), new Date().toISOString());
      eventInputs.current.set(key, input);
    }
    eventInFlight.current.add(key);
    setEventStatuses(current => ({ ...current, [key]: { kind: "sending" } }));
    client.recordEvent(input).then(() => {
      eventRecorded.current.add(key);
      setEventStatuses(current => ({ ...current, [key]: { kind: "recorded" } }));
      if (type === "accepted") onAccepted({ programKey: active.programKey, actionId: active.actionId });
      if (type === "self_reported_completed") onCompleted({ programKey: active.programKey, actionId: active.actionId });
    }).catch(error => {
      if (type === "impression" && error instanceof MissionClientError
          && error.status === 409 && error.code === "IMPRESSION_ALREADY_RECORDED") {
        eventRecorded.current.add(key);
        setEventStatuses(current => ({ ...current, [key]: { kind: "recorded" } }));
        return;
      }
      setEventStatuses(current => ({ ...current, [key]: { kind: "failed", message: loadMessage(error) } }));
    }).finally(() => eventInFlight.current.delete(key));
  }, [active, client, acceptedMissions, completedMissions, onAccepted, onCompleted, state]);

  const status = useCallback((type: MissionEventInput["eventType"]) => {
    if (!active || state.kind !== "ready") return undefined;
    if (type === "accepted" && acceptedMissions?.some(started => sameMission(started, active)))
      return { kind: "recorded" as const };
    return eventStatuses[`${state.batch.batchId}:${active.itemId}:${type}`];
  }, [active, acceptedMissions, eventStatuses, state]);

  function newBatch() {
    const next: Source = { kind: "recommend", input: { clientRequestId: newId(), mode } };
    onLocationChange(undefined);
    setSource(next);
  }

  return <section aria-label={title} data-mission-pane={pane} className="[overflow-wrap:anywhere] min-w-0">
    <header className="mb-4 min-h-[84px]">
      <h2 className="text-xl font-bold text-[#1d5931]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#61745f]">{description}</p>
    </header>
    {state.kind === "loading" && <p role="status" className="rounded-2xl bg-white p-6">미션을 불러오는 중이에요.</p>}
    {state.kind === "failed" && <section className="rounded-2xl bg-white p-6">
      <p role="alert" className="text-[#8a3825]">{state.message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {state.status === 401 && <Link href="/login?next=/missions" className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">로그인</Link>}
        <button type="button" onClick={() => setRetry(value => value + 1)} className="rounded-xl border px-4 py-2 text-sm font-bold">같은 요청으로 다시 시도</button>
        <button type="button" onClick={newBatch} className="rounded-xl border px-4 py-2 text-sm font-bold">새 미션 묶음 받기</button>
      </div>
    </section>}
    {state.kind === "empty" && <section className="rounded-2xl bg-white p-6 text-center">
      <h2 className="text-xl font-bold">추천할 미션을 찾지 못했어요</h2>
      <p className="mt-2 text-sm text-[#61745f]">관심사를 바꾸거나 새 묶음을 요청해 보세요.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/onboarding" className="rounded-xl border px-4 py-2 text-sm font-bold">관심사 설정</Link>
        <button type="button" onClick={newBatch} className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">새 미션 묶음 받기</button></div>
    </section>}
    {state.kind === "ready" && active && <>
      <MissionCard key={active.itemId} item={active} batchId={state.batch.batchId} position={state.index}
        total={state.batch.items.length} paneTitle={title} returnHref={returnHref} status={status} record={record}
        completionKnown={completedMissions !== null && acceptedMissions !== null}
        alreadyCompleted={completedMissions?.some(done => sameMission(done, active)) ?? false} />
      <nav aria-label={`${title} 카드 이동`} className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => dispatch({ type: "back" })} disabled={state.index === 0}
          className="rounded-xl border bg-white px-5 py-3 text-sm font-bold disabled:opacity-40">이전 미션</button>
        <button type="button" onClick={() => dispatch({ type: "next" })}
          className="rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">{state.index + 1 === state.batch.items.length ? "묶음 끝 확인" : "다른 미션 보기"}</button>
      </nav>
    </>}
    {state.kind === "ended" && <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#e0e9dc]">
      <span aria-hidden="true" className="text-4xl">🌿</span><h2 className="mt-4 text-2xl font-bold">이번 미션을 모두 봤어요</h2>
      <p className="mt-3 text-sm leading-6 text-[#61745f]">아직 추천하지 않은 행동부터 보여드려요. 모두 둘러봤다면 이전 행동이 다시 나올 수 있어요.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => dispatch({ type: "back" })} className="rounded-xl border px-5 py-3 text-sm font-bold">마지막 미션으로 돌아가기</button>
        <button type="button" onClick={newBatch} className="rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">새 미션 묶음 받기</button>
      </div>
    </section>}
  </section>;
}
