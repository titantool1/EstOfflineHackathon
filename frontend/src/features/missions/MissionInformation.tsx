"use client";

import { useState } from "react";
import { SourceLink } from "../sources/SourceLink";
import { participationInfo, type ParticipationCondition } from "./participation-info.ts";
import { useMissionDetail } from "./use-mission-detail.ts";

export function MissionInformation({ batchId, itemId }: { batchId: string; itemId: string }) {
  const [requested, setRequested] = useState(false);
  const state = useMissionDetail(batchId, itemId, "detail_view", requested);
  const info = state.detail ? participationInfo(state.detail.detail) : null;
  const status = state.loading ? <p role="status" className="mt-3 text-sm text-[#5d755b]">안내를 불러오는 중이에요.</p>
    : state.error ? <p role="alert" className="mt-3 text-sm text-[#9a4727]">{state.error} <button
      type="button" onClick={state.retryDetail} className="min-h-11 font-bold underline">다시 불러오기</button></p> : null;

  return <div className="mt-5 space-y-2">
    <details onToggle={event => { if (event.currentTarget.open) setRequested(true); }}
      className="rounded-2xl border border-[#e0edd9] px-4 py-2">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-bold text-[#315f33]">참여 방법과 조건 확인</summary>
      {status}
      {info && <div className="pb-2">
        <Conditions title="실천 방법과 조건" items={info.action} />
        <Conditions title="공통 참여 조건" items={info.common} />
        {!info.action.length && !info.common.length && <p className="mt-3 text-sm leading-6 text-[#5d755b]">이 미션의 참여 안내가 아직 없어요. 아래 출처에서 확인해 주세요.</p>}
        <p className="mt-4 text-xs leading-5 text-[#71816f]">참여 가능 여부와 혜택은 운영기관의 현재 기준을 확인해 주세요.</p>
      </div>}
    </details>
    <details onToggle={event => { if (event.currentTarget.open) setRequested(true); }}
      className="rounded-2xl px-4 py-1">
      <summary className="min-h-11 cursor-pointer content-center text-xs font-semibold text-[#5d7f5d]">출처 보기</summary>
      {status}
      {info && (info.sources.length ? <ul className="space-y-3 pb-3 text-sm leading-6">
        {info.sources.map(source => <li key={source.url}><SourceLink source={source} /></li>)}
      </ul> : <p className="pb-3 text-sm text-[#5d755b]">연결된 출처가 아직 없어요.</p>)}
    </details>
    {state.eventError && <p role="status" className="text-xs leading-5 text-[#71816f]">안내는 불러왔지만 열람 기록을 저장하지 못했어요. <button
      type="button" onClick={state.retryEvent} className="min-h-11 underline">기록 다시 보내기</button></p>}
  </div>;
}

function Conditions({ title, items }: { title: string; items: ParticipationCondition[] }) {
  if (!items.length) return null;
  const groups = new Map<string, ParticipationCondition[]>();
  for (const item of items) {
    const group = item.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return <section className="mt-3">
    <h3 className="text-xs font-bold text-[#4d9849]">{title}</h3>
    {[...groups].map(([group, conditions]) => {
      const sharedDetail = group && conditions.length > 1 && conditions.every(item => item.detail === conditions[0].detail)
        ? conditions[0].detail : null;
      return <div key={group} className="mt-3">
      {group && <h4 className="rounded-lg bg-[#eef6e8] px-3 py-2 text-xs font-bold leading-5 text-[#315f33]">{group}</h4>}
      <ul className="mt-2 space-y-3 text-sm leading-6 text-[#436943]">{conditions.map((item, index) => <li key={index}>
        <p className="font-semibold">{item.title}</p>
        {item.detail && !sharedDetail && <p className="mt-1 whitespace-pre-wrap text-[#5d755b]">{item.detail}</p>}
      </li>)}</ul>
      {sharedDetail && <p className="mt-2 text-sm leading-6 text-[#5d755b]">{sharedDetail}</p>}
    </div>;
    })}
  </section>;
}
