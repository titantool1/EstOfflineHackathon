"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import KakaoMap from "@/app/map/KakaoMap";
import { SourceLink } from "@/features/sources/SourceLink";
import { displayValue, kakaoAddressSearchHref } from "./detail-contract.ts";
import { actionDescription } from "./action-descriptions.ts";
import { missionMapPlaces } from "./mission-map.ts";
import { missionRouteHref, safeMissionReturnHref } from "./return-context.ts";
import { useMissionDetail } from "./use-mission-detail.ts";

export function MissionPlacesScreen({ batchId, itemId, returnTo }: {
  batchId: string; itemId: string; returnTo?: string;
}) {
  const state = useMissionDetail(batchId, itemId, "map_open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markers = useMemo(() => missionMapPlaces(state.detail?.detail.places ?? []), [state.detail]);
  const position = { batchId, itemId };
  const returnHref = safeMissionReturnHref(returnTo, position);
  if (state.loading) return <PlaceStatus title="관련 장소를 불러오는 중이에요" returnHref={returnHref} />;
  if (state.error || !state.detail) return <PlaceStatus title={state.error ?? "관련 장소를 확인하지 못했어요."}
    returnHref={returnHref} retry={state.retryDetail} />;

  const detail = state.detail.detail;
  const selected = detail.places.find(place => place.place_id === selectedId)
    ?? detail.places.find(place => place.place_id === markers[0]?.id) ?? detail.places[0];
  const selectedMarker = markers.find(marker => marker.id === selected?.place_id);
  const searchHref = selected ? kakaoAddressSearchHref(selected.address) : null;
  const title = actionDescription(detail.program_key, detail.action_id)?.title ?? detail.title;
  return <main className="[overflow-wrap:anywhere] mx-auto max-w-6xl px-5 py-8 md:py-12">
    <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
      className="text-sm font-bold text-[#397d3e] hover:underline">← 미션 카드로 돌아가기</Link>
    <header className="mt-5 rounded-3xl bg-[#eaf5e5] p-6">
      <p className="text-sm font-bold text-[#4b914e]">미션 실천 장소 지도</p>
      <h1 className="mt-2 text-2xl font-bold text-[#29452a] md:text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#60765e]">이 미션과 연결된 장소예요. 지도나 목록에서 장소를 선택해 주소를 확인하세요. 방문 전 운영 여부와 참여·혜택 조건을 확인해 주세요.</p>
    </header>

    {detail.places.some(place => place.relation_type === "candidate_action") && <p role="note"
      className="mt-4 rounded-2xl bg-[#fff4e5] p-4 text-sm leading-6 text-[#7b5929]">
      실천 유형에 따라 연결한 후보 장소예요. 해당 제도 참여나 포인트 지급 여부는 확인되지 않았어요.
    </p>}
    {detail.places.length === 0 ? <section aria-label="등록된 관련 장소 없음"
      className="mt-6 rounded-3xl bg-white p-8 text-center ring-1 ring-[#dfe9da]">
      <h2 className="text-lg font-bold text-[#345737]">등록된 관련 장소가 없어요</h2>
      <p className="mt-2 text-sm leading-6 text-[#6a7b68]">프로그램 출처에서 현재 참여 방법과 장소를 확인해 주세요.</p>
    </section> : <div className="mt-6 grid overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#dfe9da] lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="미션 관련 장소 지도" className="min-w-0 bg-[#e9f2e6]">
        {markers.length > 0 ? <div className="h-[min(55dvh,440px)] min-h-72 lg:h-[580px]">
          <KakaoMap places={markers} selectedId={selectedMarker?.id ?? null} onSelect={setSelectedId} />
        </div> : <div role="status" className="p-8 text-sm leading-6 text-[#60765e]">지도에 표시할 위치 정보가 아직 없어요. 아래 주소로 외부 지도를 열 수 있어요.</div>}
        <p className="px-5 py-3 text-xs leading-5 text-[#60765e]">지도에 표시한 장소 {markers.length}곳 · 종료되었거나 위치가 확인되지 않은 장소는 지도에 표시하지 않아요.</p>
      </section>
      <aside className="min-w-0 border-t border-[#e8eee3] lg:border-l lg:border-t-0">
        <div role="region" aria-label="미션 관련 장소 목록" className="max-h-56 overflow-y-auto p-3">
          {detail.places.map(place => <button type="button" key={`${place.place_id}:${place.service_key}`}
            onClick={() => setSelectedId(place.place_id)} aria-pressed={selected?.place_id === place.place_id}
            className={`mb-2 min-h-11 w-full rounded-xl p-3 text-left text-sm ${selected?.place_id === place.place_id ? "bg-[#eaf5e5] ring-1 ring-[#75b966]" : "hover:bg-[#f7faf5]"}`}>
            <span className="block font-bold text-[#29452a]">{place.title}</span>
            <span className="mt-1 block text-xs text-[#627460]">{place.address || "등록 주소 없음"}</span>
            {place.status === "closed" && <span className="mt-1 block text-xs text-[#8a493f]">자료상 종료 · 지도 표시 제외</span>}
          </button>)}
        </div>
        {selected && <article aria-label="선택한 장소 정보" className="border-t border-[#e8eee3] p-5">
          <h2 className="text-lg font-bold text-[#29452a]">{selected.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#627460]">{selected.address || "등록 주소 없음"}</p>
          <p className="mt-2 text-xs text-[#756c43]">{selected.status === "closed" ? "자료상 종료" : "운영·혜택 적용 미확인"}</p>
          {!selectedMarker && selected.status !== "closed" && <p className="mt-2 text-xs text-[#627460]">지도 위치 미등록</p>}
          {displayValue(selected.schedule) && <p className="mt-3 text-xs text-[#627460]">일정 안내: {displayValue(selected.schedule)}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {searchHref ? <a href={searchHref} target="_blank" rel="noopener noreferrer"
              aria-label={`${selected.title} 주소로 카카오맵 검색 열기`}
              className="inline-flex min-h-11 items-center font-bold text-[#347b3d] underline">카카오맵에서 열기 ↗</a>
              : <span className="text-xs text-[#788575]">검색할 주소 없음</span>}
            {selected.source.url ? <SourceLink source={selected.source} label="장소 근거 출처" />
              : <span className="text-xs text-[#728170]">출처: {selected.source.title} · 원문 링크 미확보</span>}
          </div>
        </article>}
      </aside>
    </div>}

    <div className="mt-6 flex flex-wrap gap-3">
      <Link href={missionRouteHref("/chat", position, returnHref)}
        className="rounded-xl bg-[#eaf5e5] px-5 py-3 font-bold text-[#347b3d]">이 미션을 챗봇에 물어보기</Link>
      <Link href={returnHref} aria-label="원래 미션 카드로 돌아가기"
        className="rounded-xl bg-[#2f843d] px-5 py-3 font-bold text-white">미션 카드로 돌아가기</Link>
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
        className="rounded-xl bg-white px-5 py-3 font-bold text-[#347b3d] ring-1 ring-[#cfe0c9]">미션 카드로 돌아가기</Link>
    </div>
  </main>;
}
