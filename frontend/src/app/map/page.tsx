"use client";

import { SiteHeader } from "@/features/navigation/SiteHeader";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import KakaoMap from "./KakaoMap";
import { currentLocation, requestPlaces, requestRoute, targetFromSearch, type Place, type RoutePoint } from "@/features/map/api";
import { mapErrorMessage } from "@/features/map/contract";

function formatRoute(distanceMeters: number | null, durationSeconds: number | null) {
  const distance = distanceMeters === null ? null : distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)}km` : `${distanceMeters}m`;
  const duration = durationSeconds === null ? null : `약 ${Math.max(1, Math.round(durationSeconds / 60))}분`;
  return [distance, duration].filter(Boolean).join(" · ");
}

export default function MapPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [activeCategory, setActiveCategory] = useState("전체");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<RoutePoint | null>(null);
  const [routePath, setRoutePath] = useState<RoutePoint[]>([]);
  const [routeSummary, setRouteSummary] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const locationRef = useRef<RoutePoint | null>(null);
  const placesRequest = useRef<AbortController | null>(null);
  const routeRequest = useRef<AbortController | null>(null);

  const clearRoute = useCallback(() => {
    routeRequest.current?.abort();
    setRoutePath([]); setRouteSummary(""); setRouteError(null); setIsRouting(false);
  }, []);

  const startRoute = useCallback(async (destination: Place) => {
    clearRoute();
    const controller = new AbortController(); routeRequest.current = controller;
    setIsRouting(true);
    try {
      const origin = locationRef.current ?? await currentLocation();
      // Geolocation cannot be aborted; its result still belongs to this selection.
      if (controller.signal.aborted) return;
      locationRef.current = origin; setUserLocation(origin);
      const result = await requestRoute(origin, destination, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setRoutePath(result.path);
      setRouteSummary(formatRoute(result.distanceMeters, result.durationSeconds));
    } catch (caught) {
      if (!controller.signal.aborted) setRouteError(mapErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) setIsRouting(false);
    }
  }, [clearRoute]);

  const loadPlaces = useCallback((query: string, initial = false) => {
    placesRequest.current?.abort();
    const controller = new AbortController(); placesRequest.current = controller;
    const target = initial ? targetFromSearch(window.location.search) : null;
    return requestPlaces(query, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const nextPlaces = target ? [target, ...result.places.filter(place => place.id !== target.id)] : result.places;
      setPlaces(nextPlaces); setActiveId(target?.id ?? nextPlaces[0]?.id ?? null); setTookMs(result.tookMs);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setPlaces(target ? [target] : []); setActiveId(target?.id ?? null); setError(mapErrorMessage(caught));
    }).finally(() => {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        if (target && new URLSearchParams(window.location.search).get("route") === "1") void startRoute(target);
      }
    });
  }, [startRoute]);

  useEffect(() => {
    void loadPlaces("", true);
    return () => { placesRequest.current?.abort(); routeRequest.current?.abort(); };
  }, [loadPlaces]);

  const categories = useMemo(() => ["전체", ...Array.from(new Set(places.map(place => place.category))).slice(0, 4)], [places]);
  const visiblePlaces = useMemo(() => activeCategory === "전체" ? places : places.filter(place => place.category === activeCategory), [activeCategory, places]);
  const activePlace = visiblePlaces.find(place => place.id === activeId) ?? visiblePlaces[0] ?? null;

  const selectPlace = useCallback((id: string) => {
    clearRoute(); setActiveId(id);
    const destination = places.find(place => place.id === id);
    if (destination && locationRef.current) void startRoute(destination);
  }, [clearRoute, places, startRoute]);
  const selectCategory = (category: string) => {
    clearRoute(); setActiveCategory(category);
    setActiveId(places.find(place => category === "전체" || place.category === category)?.id ?? null);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); clearRoute();
    setIsLoading(true); setError(null); setTookMs(null); setPlaces([]); setActiveId(null); setActiveCategory("전체");
    void loadPlaces(input.trim());
  };

  return (
    <div className="min-h-screen bg-[#f5f8f1]">
      <SiteHeader />

      <main className="[overflow-wrap:anywhere] mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6">
          <p className="text-sm font-bold text-[#4b914e]">에코 실천 지도</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Elasticsearch에서 찾은 실천 장소</h1>
          <p className="mt-2 text-sm text-[#6b8069]">서울 중심 30km 안의 좌표 등록 장소를 가까운 순으로 보여드려요.</p>
        </div>

        <div className="grid overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e3ebdc] lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="order-2 min-w-0 border-t border-[#e8eee3] lg:order-1 lg:border-t-0 lg:border-r">
            <div className="border-b border-[#e8eee3] p-5">
              <form onSubmit={handleSubmit} className="flex gap-2 rounded-xl bg-[#f3f7f0] p-2">
                <label htmlFor="place-query" className="sr-only">장소 검색</label>
                <input id="place-query" value={input} maxLength={200} onChange={(event) => setInput(event.target.value)} placeholder="예: 성동구 제로웨이스트" className="min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-[#91a08e]" />
                <button type="submit" disabled={isLoading} className="rounded-lg bg-[#2f843d] min-h-11 px-3 py-2 text-xs font-bold text-white disabled:bg-[#abc5a7]">검색</button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button key={category} type="button" onClick={() => selectCategory(category)} className={`min-h-11 max-w-full rounded-full px-3 py-2 text-xs font-bold ${activeCategory === category ? "bg-[#2f843d] text-white" : "bg-[#edf5e9] text-[#527650]"}`}>{category}</button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-[#839080]">{isLoading ? "장소를 불러오는 중…" : `${visiblePlaces.length}개 표시${tookMs !== null ? ` · ${tookMs.toLocaleString()}ms` : ""}`}</p>
            </div>

            <div className="p-3 lg:max-h-[640px] lg:overflow-y-auto">
              {error && <p role="alert" className="rounded-2xl bg-[#fff5f0] p-4 text-sm text-[#8c4934]">{error}</p>}
              {!isLoading && !error && visiblePlaces.length === 0 && <p className="p-5 text-center text-sm text-[#778575]">조건에 맞는 좌표 장소를 찾지 못했어요.</p>}
              {visiblePlaces.map((place) => (
                <button key={place.id} type="button" onClick={() => selectPlace(place.id)} className={`mb-2 w-full rounded-2xl p-4 text-left transition ${activePlace?.id === place.id ? "bg-[#edf8e8] ring-1 ring-[#75b966]" : "hover:bg-[#f7faf5]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-xs font-bold text-[#55944c]">{place.category}</p><h2 className="mt-1 font-bold text-[#254626]">{place.name}</h2><p className="mt-2 text-xs leading-5 text-[#758473]">{place.address}</p></div>
                    <span className="text-lg">📍</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-[#3e7e40]">{place.distanceKm !== null ? `${place.distanceKm}km · ` : ""}{place.benefit}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="order-1 relative min-w-0 overflow-hidden bg-[#e9f2e6] lg:order-2">
            <div className="h-[min(50dvh,400px)] min-h-60 lg:h-full lg:min-h-[640px]"><KakaoMap places={visiblePlaces} selectedId={activePlace?.id ?? null} onSelect={selectPlace} routePath={routePath} userLocation={userLocation} /></div>
            {activePlace && (
              <article className="relative m-3 rounded-2xl bg-white p-4 shadow-lg lg:absolute lg:bottom-5 lg:right-5 lg:m-0 lg:max-h-[55%] lg:w-80 lg:overflow-y-auto lg:p-5">
                <p className="text-xs font-bold text-[#54944f]">{activePlace.category}</p>
                <h2 className="mt-1 text-lg font-bold">{activePlace.name}</h2>
                <p className="mt-2 text-sm text-[#6d806b]">{activePlace.address}</p>
                <div className="mt-4 rounded-xl bg-[#f1f8ed] p-3 text-xs font-medium leading-5 text-[#387c3f]">🌱 {activePlace.benefit}</div>
                <button type="button" onClick={() => void startRoute(activePlace)} disabled={isRouting} className="mt-4 w-full rounded-xl bg-[#2f843d] py-3 text-sm font-bold text-white disabled:bg-[#a7bea4]">{isRouting ? "경로 계산 중…" : userLocation ? "현재 위치에서 경로 다시 보기" : "현재 위치에서 경로 보기"}</button>
                {routeSummary && <p className="mt-2 text-center text-xs font-bold text-[#347d40]">🚗 {routeSummary}</p>}
                {routeError && <p role="alert" className="mt-2 rounded-lg bg-[#fff5f0] px-3 py-2 text-[11px] leading-4 text-[#8c4934]">{routeError}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] font-semibold">
                  <a href={`https://map.kakao.com/link/to/${encodeURIComponent(activePlace.name)},${activePlace.latitude},${activePlace.longitude}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[#347d40] underline">카카오맵에서 열기 ↗</a>
                  {activePlace.sourceUrl && <a href={activePlace.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[#6d806b] underline">공식 출처 ↗</a>}
                </div>
                {!activePlace.sourceUrl && !routeError && <p className="mt-3 text-center text-[10px] text-[#8a9688]">방문 전 운영 여부와 혜택을 확인해 주세요.</p>}
              </article>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
