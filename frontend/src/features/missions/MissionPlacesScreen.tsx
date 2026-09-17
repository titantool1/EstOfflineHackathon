"use client";

import Link from "next/link";
import { SourceLink } from "@/features/sources/SourceLink";
import { displayValue, kakaoAddressSearchHref } from "./detail-contract.ts";
import { missionRouteHref, safeMissionReturnHref } from "./return-context.ts";
import { useMissionDetail } from "./use-mission-detail.ts";

export function MissionPlacesScreen({ batchId, itemId, returnTo }: {
  batchId: string; itemId: string; returnTo?: string;
}) {
  const state = useMissionDetail(batchId, itemId, "map_open");
  const position = { batchId, itemId };
  const returnHref = safeMissionReturnHref(returnTo, position);
  if (state.loading) return <PlaceStatus title="관련 장소를 불러오는 중이에요" returnHref={returnHref} />;
  if (state.error || !state.detail) return <PlaceStatus title={state.error ?? "관련 장소를 확인하지 못했어요."}
    returnHref={returnHref} retry={state.retryDetail} />;

  const detail = state.detail.detail;
  return <main className="[overflow-wrap:anywhere] mx-auto max-w-5xl px-5 py-8 md:py-12">
    <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
      className="text-sm font-bold text-[#397d3e] hover:underline">← 미션 카드로 돌아가기</Link>
    <header className="mt-5 rounded-3xl bg-[#eaf5e5] p-6 md:p-8">
      <p className="text-sm font-bold text-[#4b914e]">미션에 연결된 관련 장소</p>
      <h1 className="mt-2 text-2xl font-bold text-[#29452a] md:text-3xl">{detail.title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#60765e]">이 미션에 등록된 장소예요. 주소로 지도를 열고 방문 전 운영 여부를 확인해 주세요.</p>
    </header>

    {detail.places.length === 0 ? <section aria-label="등록된 관련 장소 없음"
      className="mt-6 rounded-3xl bg-white p-8 text-center ring-1 ring-[#dfe9da]">
      <h2 className="text-lg font-bold text-[#345737]">등록된 관련 장소가 없어요</h2>
      <p className="mt-2 text-sm leading-6 text-[#6a7b68]">장소가 필요 없다는 뜻은 아니에요. 프로그램 출처에서 현재 참여 방법과 장소를 확인해 주세요.</p>
    </section> : <section aria-label="미션 관련 장소 목록" className="mt-6 grid gap-4 md:grid-cols-2">
      {detail.places.map(place => {
        const searchHref = kakaoAddressSearchHref(place.address);
        return <article key={`${place.place_id}:${place.service_key}`}
          className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfe9da]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="min-w-0 text-lg font-bold text-[#29452a]">{place.title}</h2>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${place.status === "closed"
              ? "bg-[#f4e5e2] text-[#8a493f]" : "bg-[#f2f1e8] text-[#756c43]"}`}>
              {place.status === "closed" ? "자료상 종료" : "운영 상태 미확인"}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#627460]">{place.address || "등록 주소 없음"}</p>
          <dl className="mt-4 space-y-2 text-xs text-[#728170]">
            <div><dt className="inline font-bold">일정 원문 </dt><dd className="inline">{displayValue(place.schedule) ?? "확인 필요"}</dd></div>
            <div><dt className="inline font-bold">시작일 </dt><dd className="inline">{place.announced_start ?? "미확인"}</dd></div>
            <div><dt className="inline font-bold">종료 기준일(해당 날짜 제외) </dt><dd className="inline">{place.announced_end_exclusive ?? "미확인"}</dd></div>
          </dl>
          <details className="mt-3 text-xs text-[#7b8879]">
            <summary className="cursor-pointer font-semibold">등록 식별값</summary>
            <p className="mt-1 break-all">장소 {place.place_id} · 서비스 {place.service_key}</p>
          </details>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
            {searchHref ? <a href={searchHref} target="_blank" rel="noopener noreferrer"
              aria-label={`${place.title} 주소로 카카오맵 검색 열기`}
              className="rounded-xl bg-[#eaf5e5] px-4 py-3 font-bold text-[#347b3d]">주소로 카카오맵 검색 ↗</a>
              : <span className="rounded-xl bg-[#f4f5f2] px-4 py-3 text-[#788575]">검색할 주소 없음</span>}
            <SourceLink source={place.source} label="장소 근거 출처" />
          </div>
        </article>;
      })}
    </section>}

    <div className="mt-6 flex flex-wrap gap-3">
      <Link href={missionRouteHref("/missions/detail", position, returnHref)}
        aria-label="이 미션 상세로 돌아가기"
        className="rounded-xl bg-white px-5 py-3 font-bold text-[#347b3d] ring-1 ring-[#cfe0c9]">미션 상세 보기</Link>
      <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
        className="rounded-xl bg-[#2f843d] px-5 py-3 font-bold text-white">카드로 돌아가기</Link>
    </div>
    {state.eventError && <aside role="status" className="mt-5 rounded-2xl bg-[#fff4e5] p-4 text-sm text-[#7b5929]">
      장소는 표시했지만 열람 기록을 저장하지 못했어요. <button type="button" onClick={state.retryEvent}
        className="font-bold underline">같은 기록 다시 보내기</button>
    </aside>}
  </main>;
}

function PlaceStatus({ title, returnHref, retry }: { title: string; returnHref: string; retry?: () => void }) {
  return <main className="[overflow-wrap:anywhere] mx-auto max-w-2xl px-5 py-16 text-center">
    <h1 className="text-xl font-bold text-[#29452a]">{title}</h1>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {retry && <button type="button" onClick={retry} aria-label="미션 관련 장소 다시 불러오기"
        className="rounded-xl bg-[#2f843d] px-5 py-3 font-bold text-white">다시 시도</button>}
      <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
        className="rounded-xl bg-white px-5 py-3 font-bold text-[#347b3d] ring-1 ring-[#cfe0c9]">카드로 돌아가기</Link>
    </div>
  </main>;
}
