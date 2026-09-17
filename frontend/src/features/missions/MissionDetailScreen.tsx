"use client";

import Link from "next/link";
import { SourceLink } from "@/features/sources/SourceLink";
import { displayValue, missionReturnHref } from "./detail-contract.ts";
import { useMissionDetail } from "./use-mission-detail.ts";

function programField(program: Record<string, unknown>, key: string) {
  return displayValue(program[key]);
}

export function MissionDetailScreen({ batchId, itemId }: { batchId: string; itemId: string }) {
  const state = useMissionDetail(batchId, itemId, "detail_view");
  const returnHref = missionReturnHref(batchId, itemId);

  if (state.loading) return <Status title="미션 상세를 불러오는 중이에요" returnHref={returnHref} />;
  if (state.error || !state.detail) return <Status title={state.error ?? "상세 정보를 확인하지 못했어요."}
    returnHref={returnHref} retry={state.retryDetail} />;

  const detail = state.detail.detail;
  return <main className="mx-auto max-w-4xl px-5 py-8 md:py-12">
    <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
      className="text-sm font-bold text-[#397d3e] hover:underline">← 미션 카드로 돌아가기</Link>
    <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfe9da] md:p-8">
      <p className="text-xs font-bold text-[#5b8c55]">등록된 제도·행동 상세</p>
      <h1 className="mt-2 text-2xl font-bold text-[#29452a] md:text-3xl">{detail.title}</h1>
      <p className="mt-3 break-all text-xs text-[#71816f]">행동 ID {detail.action_id} · {detail.identity_basis}</p>
      {programField(detail.program, "benefit") && <section aria-labelledby="benefit-title"
        className="mt-6 rounded-2xl bg-[#eef7e9] p-5">
        <h2 id="benefit-title" className="font-bold text-[#315f35]">등록 자료의 혜택 안내</h2>
        <p className="mt-2 text-sm leading-6 text-[#526b50]">{programField(detail.program, "benefit")}</p>
      </section>}
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <Info label="대상 원문" value={programField(detail.program, "target")} />
        <Info label="신청 방법" value={programField(detail.program, "application_method")} />
        <Info label="이용 기간" value={programField(detail.program, "usage_period")} />
        <Info label="자료 상태" value={detail.program_status} />
      </dl>
      <p className="mt-6 rounded-2xl bg-[#f6f3e8] p-4 text-sm leading-6 text-[#6f633e]">
        자격은 아직 평가하지 않았어요. 실제 참여 전 현재 조건과 운영 상태를 출처에서 확인해 주세요.
      </p>
    </section>

    <section aria-labelledby="condition-title" className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfe9da] md:p-8">
      <h2 id="condition-title" className="text-xl font-bold text-[#29452a]">행동 조건과 근거</h2>
      {detail.conditions.length === 0 ? <p className="mt-4 text-sm text-[#6a7b68]">등록된 행동 조건이 없어요. 출처에서 현재 조건을 확인해 주세요.</p>
        : <ul className="mt-4 space-y-4">{detail.conditions.map((entry, index) => <li
          key={String(entry.condition.id ?? index)} className="rounded-2xl bg-[#f7faf5] p-4">
          <p className="font-semibold text-[#345737]">{displayValue(entry.condition.requirement) ?? `조건 ${index + 1}`}</p>
          {displayValue(entry.condition.detail) && <p className="mt-2 text-sm leading-6 text-[#667864]">{displayValue(entry.condition.detail)}</p>}
          <p className="mt-2 text-xs text-[#788775]">매핑 근거: {entry.mapping_basis}</p>
          {entry.sources.length > 0 && <ul aria-label={`조건 ${index + 1} 출처`} className="mt-3 space-y-1 text-sm">
            {entry.sources.map(source => <li key={source.id}><SourceLink source={source} /></li>)}
          </ul>}
        </li>)}</ul>}
    </section>

    <section aria-labelledby="source-title" className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfe9da] md:p-8">
      <h2 id="source-title" className="text-xl font-bold text-[#29452a]">프로그램 출처</h2>
      {detail.overview_sources.length ? <ul className="mt-4 space-y-2">
        {detail.overview_sources.map(source => <li key={source.id}><SourceLink source={source} /></li>)}
      </ul> : <p className="mt-4 text-sm text-[#6a7b68]">별도 프로그램 출처가 연결되지 않았어요.</p>}
    </section>

    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <Link href={`/map/mission?${new URLSearchParams({ batchId, itemId })}`} aria-label="이 미션의 관련 장소 보기"
        className="rounded-2xl bg-[#2f843d] px-5 py-4 text-center font-bold text-white">관련 장소 {detail.places.length}건 보기</Link>
      <Link href={returnHref} className="rounded-2xl bg-white px-5 py-4 text-center font-bold text-[#347b3d] ring-1 ring-[#cfe0c9]">카드로 돌아가기</Link>
    </div>
    {state.eventError && <aside role="status" className="mt-5 rounded-2xl bg-[#fff4e5] p-4 text-sm text-[#7b5929]">
      상세 정보는 표시했지만 열람 기록을 저장하지 못했어요. <button type="button" onClick={state.retryEvent}
        className="font-bold underline">같은 기록 다시 보내기</button>
    </aside>}
  </main>;
}

function Info({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="font-bold text-[#456847]">{label}</dt><dd className="mt-1 leading-6 text-[#697967]">{value ?? "등록 자료에서 확인 필요"}</dd></div>;
}

function Status({ title, returnHref, retry }: { title: string; returnHref: string; retry?: () => void }) {
  return <main className="mx-auto max-w-2xl px-5 py-16 text-center">
    <h1 className="text-xl font-bold text-[#29452a]">{title}</h1>
    <div className="mt-6 flex justify-center gap-3">
      {retry && <button type="button" onClick={retry} aria-label="미션 상세 다시 불러오기"
        className="rounded-xl bg-[#2f843d] px-5 py-3 font-bold text-white">다시 시도</button>}
      <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
        className="rounded-xl bg-white px-5 py-3 font-bold text-[#347b3d] ring-1 ring-[#cfe0c9]">카드로 돌아가기</Link>
    </div>
  </main>;
}
