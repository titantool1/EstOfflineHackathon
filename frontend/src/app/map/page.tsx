"use client";

import { readBrowseDistrict, setBrowseDistrict, subscribeBrowseDistrict } from "@/features/navigation/browse-district";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import KakaoMap from "./KakaoMap";
import { requestPlaces, targetFromSearch, type Place } from "@/features/map/api";
import { mapErrorMessage } from "@/features/map/contract";

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [activeCategory, setActiveCategory] = useState("전체");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchRegion, setSearchRegion] = useState<{ sido: string; sigungu: string } | null>(null);
  const placesRequest = useRef<AbortController | null>(null);
  const useNeighborhood = useRef(true);
  const loadPlaces = useCallback((query: string, initial = false, browseDistrict = readBrowseDistrict()) => {
    placesRequest.current?.abort();
    const controller = new AbortController(); placesRequest.current = controller;
    const target = initial ? targetFromSearch(window.location.search) : null;
    return requestPlaces(query, { signal: controller.signal, browseDistrict, useNeighborhood: useNeighborhood.current }).then(result => {
      if (controller.signal.aborted) return;
      const nextPlaces = target ? [target, ...result.places.filter(place => place.id !== target.id)] : result.places;
      setSearchRegion(result.region);
      setPlaces(nextPlaces); setActiveId(target?.id ?? nextPlaces[0]?.id ?? null);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setPlaces(target ? [target] : []); setActiveId(target?.id ?? null); setError(mapErrorMessage(caught));
    }).finally(() => {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    void loadPlaces("", true);
    const unsubscribe = subscribeBrowseDistrict(() => {
      useNeighborhood.current = false;
      setInput(""); setPlaces([]); setActiveId(null); setActiveCategory("전체"); setSearchRegion(null); setError(null); setIsLoading(true);
      void loadPlaces("");
    });
    return () => { unsubscribe(); placesRequest.current?.abort(); };
  }, [loadPlaces]);

  const categories = useMemo(() => ["전체", ...Array.from(new Set(places.map(place => place.category))).slice(0, 4)], [places]);
  const visiblePlaces = useMemo(() => activeCategory === "전체" ? places : places.filter(place => place.category === activeCategory), [activeCategory, places]);
  const activePlace = visiblePlaces.find(place => place.id === activeId) ?? visiblePlaces[0] ?? null;

  const selectCategory = (category: string) => {
    if (category === "전체") {
      setInput("");
      const url = new URL(window.location.href);
      for (const key of ["placeId", "name", "lat", "lng", "address", "category", "route"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      setBrowseDistrict("");
      return;
    }
    setActiveCategory(category);
    setActiveId(places.find(place => category === "전체" || place.category === category)?.id ?? null);
  };
  const searchPlaces = (query = input.trim()) => {
    setSearchRegion(null);
    setIsLoading(true); setError(null); setPlaces([]); setActiveId(null); setActiveCategory("전체");
    void loadPlaces(query);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); searchPlaces(input.trim());
  };

  return (
    <div className="min-h-screen bg-[#f5f8f1] text-[#29452a]">
      <SiteHeader />

      <main className="[overflow-wrap:anywhere] mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6 rounded-3xl bg-[#e9f5e2] p-5 sm:p-7">
          <p className="text-sm font-bold text-[#4b914e]">에코 실천 지도</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">친환경 실천을 위한 내 주변 맞춤 지도</h1>
          <p className="mt-2 text-sm text-[#6b8069]">{searchRegion ? `${searchRegion.sido} ${searchRegion.sigungu}에 등록된 실천 장소를 보여드려요. 최대 40곳까지 표시해요.` : "지역을 검색하면 해당 구의 등록 장소를 보여드려요. 기본 목록은 서울 중심 30km 안의 장소예요."}</p>
        </div>

        <div className="grid overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e3ebdc] lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="order-2 min-w-0 border-t border-[#e8eee3] lg:order-1 lg:border-t-0 lg:border-r">
            <div className="border-b border-[#e8eee3] p-5">
              <form onSubmit={handleSubmit} className="flex gap-2 rounded-xl bg-[#f3f7f0] p-2 focus-within:ring-2 focus-within:ring-[#75b966]">
                <label htmlFor="place-query" className="sr-only">장소 검색</label>
                <input id="place-query" value={input} maxLength={200} onChange={(event) => setInput(event.target.value)} placeholder="예: 홍대 텀블러, 서울 마포구" className="min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-[#91a08e]" />
                <button type="submit" disabled={isLoading} className="rounded-lg bg-[#2f843d] min-h-11 px-3 py-2 text-xs font-bold text-white disabled:bg-[#abc5a7]">검색</button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button key={category} type="button" onClick={() => selectCategory(category)} aria-pressed={activeCategory === category} className={`min-h-11 max-w-full rounded-full px-3 py-2 text-xs font-bold ${activeCategory === category ? "bg-[#2f843d] text-white" : "bg-[#edf5e9] text-[#527650]"}`}>{category === "전체" ? "전체 장소 보기" : category}</button>
                ))}
              </div>
              <p role="status" className="mt-3 text-xs text-[#61745f]">{isLoading ? "실천할 수 있는 장소를 찾고 있어요…" : error ? "장소를 불러오지 못했어요." : `${visiblePlaces.length}곳을 찾았어요`}</p>
            </div>

            <div className="p-3 lg:max-h-[640px] lg:overflow-y-auto">
              {error && <div className="rounded-2xl bg-[#fff5f0] p-4 text-sm text-[#8c4934]"><p role="alert" className="leading-6">{error}</p><button type="button" onClick={() => searchPlaces()} disabled={isLoading} className="mt-2 min-h-11 rounded-xl border border-[#dcbcaf] px-4 py-2 font-bold disabled:opacity-60">장소 다시 불러오기</button></div>}
              {!isLoading && !error && visiblePlaces.length === 0 && <div className="rounded-2xl bg-[#f3f7ef] p-5 text-center text-sm leading-6 text-[#61745f]"><span aria-hidden="true" className="text-3xl">🌿</span><p className="mt-3 font-bold text-[#29452a]">검색한 장소가 아직 없어요.</p><p className="mt-2">다른 동네 이름이나 활동으로 검색해 보세요.</p></div>}
              {visiblePlaces.map((place) => (
                <button key={place.id} type="button" onClick={() => setActiveId(place.id)} aria-pressed={activePlace?.id === place.id} className={`mb-2 w-full rounded-2xl p-4 text-left transition ${activePlace?.id === place.id ? "bg-[#edf8e8] ring-1 ring-[#75b966]" : "hover:bg-[#f7faf5]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-xs font-bold text-[#55944c]">{place.category}</p><h2 className="mt-1 font-bold text-[#254626]">{place.name}</h2><p className="mt-2 text-xs leading-5 text-[#758473]">{place.address}</p></div>
                    <span aria-hidden="true" className="text-lg">📍</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-[#3e7e40]">{place.distanceKm !== null ? `${place.distanceKm}km · ` : ""}{place.benefit}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="order-1 relative min-w-0 overflow-hidden bg-[#e9f2e6] lg:order-2">
            <div className="h-[min(50dvh,400px)] min-h-60 lg:h-full lg:min-h-[640px]"><KakaoMap places={visiblePlaces} selectedId={activePlace?.id ?? null} onSelect={setActiveId} /></div>
            {activePlace && (
              <article className="relative m-3 rounded-2xl bg-white p-4 shadow-lg lg:absolute lg:bottom-5 lg:right-5 lg:m-0 lg:max-h-[55%] lg:w-80 lg:overflow-y-auto lg:p-5">
                <p className="text-xs font-bold text-[#54944f]">{activePlace.category}</p>
                <h2 className="mt-1 text-lg font-bold">{activePlace.name}</h2>
                <p className="mt-2 text-sm text-[#6d806b]">{activePlace.address}</p>
                <div className="mt-4 rounded-xl bg-[#f1f8ed] p-3 text-xs font-medium leading-5 text-[#387c3f]">🌱 {activePlace.benefit}</div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] font-semibold">
                  <a href={`https://map.kakao.com/link/map/${encodeURIComponent(activePlace.name)},${activePlace.latitude},${activePlace.longitude}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[#347d40] underline">카카오맵에서 열기 ↗</a>
                  {activePlace.sourceUrl && <a href={activePlace.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[#6d806b] underline">공식 출처 ↗</a>}
                </div>
                {!activePlace.sourceUrl && <p className="mt-3 text-center text-[10px] text-[#8a9688]">방문 전 운영 여부와 혜택을 확인해 주세요.</p>}
              </article>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
