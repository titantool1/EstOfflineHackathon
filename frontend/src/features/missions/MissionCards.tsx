"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SourceText } from "@/features/sources/SourceText";
import { createMissionClient, MissionClientError } from "./client.ts";
import type { MissionEventInput, MissionRecommendationItem } from "./contract.ts";
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

function MissionCard({ item, batchId, position, total, paneTitle, returnHref, status, record }: {
  item: MissionRecommendationItem;
  batchId: string;
  position: number;
  total: number;
  paneTitle: string;
  returnHref: string;
  status: (type: MissionEventInput["eventType"]) => EventStatus | undefined;
  record: (type: MissionEventInput["eventType"]) => void;
}) {
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
  return <article ref={articleRef} aria-label={`${paneTitle} 추천 미션 ${position + 1}: ${item.programTitle}`}
    className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e0e9dc] sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold text-[#40883f]">추천 {position + 1} / {total}</p>
      <p className="rounded-full bg-[#f0f6ec] px-3 py-1 text-xs text-[#587454]">자격은 아직 평가하지 않았어요</p>
    </div>
    <p className="mt-6 text-xs font-bold uppercase tracking-wide text-[#6b8668]">프로그램</p>
    <h2 className="mt-2 text-2xl font-bold leading-tight text-[#284527]">{item.programTitle}</h2>
    <p className="mt-4 text-xs font-semibold text-[#758672]">프로그램 안내·혜택 원문</p>
    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#61745f]"><SourceText text={item.programSummary} /></p>
    <dl className="mt-6 grid gap-3 rounded-2xl bg-[#f7faf5] p-4 text-sm sm:grid-cols-2">
      <div><dt className="text-xs font-semibold text-[#758672]">행동 식별자</dt><dd className="mt-1 break-all font-medium text-[#304b30]">{item.actionId}</dd></div>
      <div><dt className="text-xs font-semibold text-[#758672]">프로그램 식별자</dt><dd className="mt-1 break-all font-medium text-[#304b30]">{item.programKey}</dd></div>
      <div><dt className="text-xs font-semibold text-[#758672]">원문 상태</dt><dd className="mt-1 font-medium text-[#304b30]">{item.programStatusRaw || "확인 필요"}</dd></div>
      <div><dt className="text-xs font-semibold text-[#758672]">관련 장소</dt><dd className="mt-1 font-medium text-[#304b30]">{item.relatedPlaceCount > 0 ? `${item.relatedPlaceCount}곳 등록` : "등록 정보 확인 필요"}</dd></div>
    </dl>
    <p className="mt-4 text-xs leading-5 text-[#71816f]">현재 조건과 자격을 자동 판정하지 않아요. 참여 전 상세 화면의 현행 조건과 공식 출처를 확인해 주세요.</p>
    <div className="mt-6 grid gap-2 sm:grid-cols-2">
      <Link href={missionRouteHref("/missions/detail", missionPosition, returnHref)} aria-label={`${item.programTitle} 상세 보기`}
        className="rounded-xl bg-[#eaf5e5] px-4 py-3 text-center text-sm font-bold text-[#347b3d]">상세 보기</Link>
      {item.relatedPlaceCount > 0 ? <Link href={missionRouteHref("/map/mission", missionPosition, returnHref)} aria-label={`${item.programTitle} 관련 장소 보기`}
        className="rounded-xl bg-[#eaf5e5] px-4 py-3 text-center text-sm font-bold text-[#347b3d]">관련 장소 보기</Link>
        : <p className="rounded-xl bg-[#f4f6f2] px-4 py-3 text-center text-sm font-semibold text-[#71816f]">등록된 관련 장소 없음 · 상세에서 확인</p>}
      <button type="button" onClick={() => record("accepted")} disabled={accepted?.kind === "sending" || accepted?.kind === "recorded"}
        className="rounded-xl border border-[#8fbd84] px-4 py-3 text-sm font-bold text-[#347b3d] disabled:opacity-60">
        {accepted?.kind === "recorded" ? "도전하기로 했어요" : accepted?.kind === "sending" ? "저장 중" : "이 미션 해볼게요"}
      </button>
      <button type="button" onClick={() => record("self_reported_completed")} disabled={completed?.kind === "sending" || completed?.kind === "recorded"}
        className="rounded-xl bg-[#2f843d] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
        {completed?.kind === "recorded" ? "내 실천으로 기록됨" : completed?.kind === "sending" ? "저장 중" : "실천했다고 기록"}
      </button>
    </div>
    <p className="mt-3 text-xs text-[#71816f]">실천 기록은 본인의 자기보고이며 프로그램의 공식 완료·포인트 지급을 뜻하지 않아요.</p>
    {impression?.kind === "failed" && <EventFailure label={eventLabel.impression} retry={() => record("impression")} />}
    {accepted?.kind === "failed" && <EventFailure label={eventLabel.accepted} retry={() => record("accepted")} />}
    {completed?.kind === "failed" && <EventFailure label={eventLabel.self_reported_completed} retry={() => record("self_reported_completed")} />}
  </article>;
}

export function MissionCards({ pane, mode, title, description, initialPosition, returnHref, onLocationChange }: {
  pane: MissionPane;
  mode: "interests" | "general";
  title: string;
  description: string;
  initialPosition?: MissionPosition;
  returnHref: string;
  onLocationChange: (position?: MissionPosition) => void;
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
    }).catch(error => {
      if (type === "impression" && error instanceof MissionClientError
          && error.status === 409 && error.code === "IMPRESSION_ALREADY_RECORDED") {
        eventRecorded.current.add(key);
        setEventStatuses(current => ({ ...current, [key]: { kind: "recorded" } }));
        return;
      }
      setEventStatuses(current => ({ ...current, [key]: { kind: "failed", message: loadMessage(error) } }));
    }).finally(() => eventInFlight.current.delete(key));
  }, [active, client, state]);

  const status = useCallback((type: MissionEventInput["eventType"]) => {
    if (!active || state.kind !== "ready") return undefined;
    return eventStatuses[`${state.batch.batchId}:${active.itemId}:${type}`];
  }, [active, eventStatuses, state]);

  function newBatch() {
    const next: Source = { kind: "recommend", input: { clientRequestId: newId(), mode } };
    onLocationChange(undefined);
    setSource(next);
  }

  return <section aria-label={title} data-mission-pane={pane} className="[overflow-wrap:anywhere] min-w-0">
    <header className="mb-5 rounded-3xl bg-white/70 p-5 ring-1 ring-[#dfe9da]">
      <h2 className="text-xl font-bold text-[#284527]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#61745f]">{description}</p>
    </header>
    {state.kind === "loading" && <p role="status" className="rounded-2xl bg-white p-6">미션을 불러오는 중이에요.</p>}
    {state.kind === "failed" && <section className="rounded-2xl bg-white p-6">
      <p role="alert" className="text-[#8a3825]">{state.message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {state.status === 401 && <Link href="/login" className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">로그인</Link>}
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
        total={state.batch.items.length} paneTitle={title} returnHref={returnHref} status={status} record={record} />
      <nav aria-label={`${title} 카드 이동`} className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => dispatch({ type: "back" })} disabled={state.index === 0}
          className="rounded-xl border bg-white px-5 py-3 text-sm font-bold disabled:opacity-40">이전 미션</button>
        <button type="button" onClick={() => dispatch({ type: "next" })}
          className="rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">{state.index + 1 === state.batch.items.length ? "묶음 끝 확인" : "다음 미션"}</button>
      </nav>
    </>}
    {state.kind === "ended" && <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#e0e9dc]">
      <span aria-hidden="true" className="text-4xl">🌿</span><h2 className="mt-4 text-2xl font-bold">이번 미션을 모두 봤어요</h2>
      <p className="mt-3 text-sm leading-6 text-[#61745f]">다른 미션도 살펴볼까요?</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => dispatch({ type: "back" })} className="rounded-xl border px-5 py-3 text-sm font-bold">마지막 미션으로 돌아가기</button>
        <button type="button" onClick={newBatch} className="rounded-xl bg-[#2f843d] px-5 py-3 text-sm font-bold text-white">새 미션 묶음 받기</button>
      </div>
    </section>}
  </section>;
}
