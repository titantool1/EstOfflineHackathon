"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import KakaoMap, { type EcoPlace, type RoutePoint } from "./KakaoMap";

type Place = EcoPlace & {
  category: string;
  address: string;
  benefit: string;
  sourceUrl: string | null;
  distanceKm: number | null;
};

type PlaceResult = {
  docId: string;
  title: string;
  category: string | null;
  summary: string;
  address: string | null;
  sourceUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
};

type PlacesResponse = {
  results: PlaceResult[];
  meta: { resultCount: number; tookMs: number };
  error?: string;
};

type RouteResponse = {
  path?: RoutePoint[];
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  error?: string;
  code?: string;
};

const SEOUL_CENTER = { latitude: 37.5665, longitude: 126.978 };

function toPlaces(results: PlaceResult[]): Place[] {
  return results.flatMap((result) => {
    if (typeof result.latitude !== "number" || typeof result.longitude !== "number") return [];
    return [{
      id: result.docId,
      name: result.title,
      category: result.category ?? "친환경 실천 장소",
      address: result.address ?? "주소 정보 없음",
      benefit: result.summary,
      sourceUrl: result.sourceUrl,
      distanceKm: typeof result.distanceKm === "number" ? result.distanceKm : null,
      latitude: result.latitude,
      longitude: result.longitude,
    }];
  });
}

async function requestPlaces(query: string) {
  const response = await fetch("/api/places", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, region: "서울특별시", ...SEOUL_CENTER, distanceKm: 30 }),
  });
  const payload = (await response.json()) as PlacesResponse;
  if (!response.ok) throw new Error(payload.error ?? "장소를 불러오지 못했어요.");
  return { places: toPlaces(payload.results), tookMs: payload.meta.tookMs };
}

function currentLocation() {
  return new Promise<RoutePoint>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저에서는 현재 위치를 사용할 수 없어요."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error("현재 위치 권한을 허용해야 경로를 표시할 수 있어요.")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

function formatRoute(distanceMeters: number | null, durationSeconds: number | null) {
  const distance = distanceMeters === null
    ? null
    : distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)}km` : `${distanceMeters}m`;
  const duration = durationSeconds === null ? null : `약 ${Math.max(1, Math.round(durationSeconds / 60))}분`;
  return [distance, duration].filter(Boolean).join(" · ");
}

function targetFromUrl(): Place | null {
  const params = new URLSearchParams(window.location.search);
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lng"));
  const id = params.get("placeId");
  const name = params.get("name");
  if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id,
    name,
    address: params.get("address") ?? "주소 정보 없음",
    category: params.get("category") ?? "친환경 실천 장소",
    benefit: "줍줍이 챗봇이 검색한 친환경 실천 장소예요.",
    sourceUrl: null,
    distanceKm: null,
    latitude,
    longitude,
  };
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

  const loadRoute = useCallback(async (origin: RoutePoint, destination: Place) => {
    setIsRouting(true);
    setRouteError(null);
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination }),
      });
      const payload = (await response.json()) as RouteResponse;
      if (!response.ok || !payload.path) throw new Error(payload.error ?? "경로를 불러오지 못했어요.");
      setRoutePath(payload.path);
      setRouteSummary(formatRoute(payload.distanceMeters ?? null, payload.durationSeconds ?? null));
    } catch (routeRequestError) {
      setRoutePath([]);
      setRouteSummary("");
      setRouteError(routeRequestError instanceof Error ? routeRequestError.message : "경로를 불러오지 못했어요.");
    } finally {
      setIsRouting(false);
    }
  }, []);

  const startRoute = useCallback(async (destination: Place) => {
    setIsRouting(true);
    setRouteError(null);
    try {
      const origin = userLocation ?? await currentLocation();
      setUserLocation(origin);
      await loadRoute(origin, destination);
    } catch (locationError) {
      setRouteError(locationError instanceof Error ? locationError.message : "현재 위치를 확인하지 못했어요.");
      setIsRouting(false);
    }
  }, [loadRoute, userLocation]);

  const loadPlaces = useCallback(async (query: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { places: nextPlaces, tookMs: nextTookMs } = await requestPlaces(query);
      setPlaces(nextPlaces);
      setActiveId(nextPlaces[0]?.id ?? null);
      setActiveCategory("전체");
      setTookMs(nextTookMs);
      setRoutePath([]);
      setRouteSummary("");
    } catch (requestError) {
      setPlaces([]);
      setActiveId(null);
      setError(requestError instanceof Error ? requestError.message : "잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestPlaces("").then(({ places: nextPlaces, tookMs: nextTookMs }) => {
      if (cancelled) return;
      const target = targetFromUrl();
      const mergedPlaces = target
        ? [target, ...nextPlaces.filter((place) => place.id !== target.id)]
        : nextPlaces;
      setPlaces(mergedPlaces);
      setActiveId(target?.id ?? nextPlaces[0]?.id ?? null);
      setTookMs(nextTookMs);
      if (target && new URLSearchParams(window.location.search).get("route") === "1") {
        currentLocation().then((origin) => {
          if (cancelled) return;
          setUserLocation(origin);
          void loadRoute(origin, target);
        }).catch((locationError: unknown) => {
          if (!cancelled) setRouteError(locationError instanceof Error ? locationError.message : "현재 위치를 확인하지 못했어요.");
        });
      }
    }).catch((requestError: unknown) => {
      if (!cancelled) setError(requestError instanceof Error ? requestError.message : "잠시 후 다시 시도해 주세요.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [loadRoute]);

  const categories = useMemo(
    () => ["전체", ...Array.from(new Set(places.map((place) => place.category))).slice(0, 4)],
    [places],
  );
  const visiblePlaces = useMemo(
    () => activeCategory === "전체" ? places : places.filter((place) => place.category === activeCategory),
    [activeCategory, places],
  );
  const activePlace = visiblePlaces.find((place) => place.id === activeId) ?? visiblePlaces[0] ?? null;

  const selectPlace = useCallback((id: string) => {
    setActiveId(id);
    const destination = places.find((place) => place.id === id);
    if (destination && userLocation) void loadRoute(userLocation, destination);
  }, [loadRoute, places, userLocation]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadPlaces(input.trim());
  };

  return (
    <div className="min-h-screen bg-[#f5f8f1]">
      <header className="border-b border-[#e5eddc] bg-white/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
          <nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions">에코 미션</Link><Link href="/map" className="font-bold text-[#287b39]">실천 지도</Link><Link href="/chat">줍줍이 챗봇</Link></nav>
          <Link href="/chat" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">챗봇에 물어보기</Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-6">
          <p className="text-sm font-bold text-[#4b914e]">에코 실천 지도</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Elasticsearch에서 찾은 실천 장소</h1>
          <p className="mt-2 text-sm text-[#6b8069]">서울 중심 30km 안의 좌표 등록 장소를 가까운 순으로 보여드려요.</p>
        </div>

        <div className="grid overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e3ebdc] lg:grid-cols-[360px_1fr]">
          <aside className="order-2 border-t border-[#e8eee3] lg:order-1 lg:border-t-0 lg:border-r">
            <div className="border-b border-[#e8eee3] p-5">
              <form onSubmit={handleSubmit} className="flex gap-2 rounded-xl bg-[#f3f7f0] p-2">
                <label htmlFor="place-query" className="sr-only">장소 검색</label>
                <input id="place-query" value={input} maxLength={200} onChange={(event) => setInput(event.target.value)} placeholder="예: 성동구 제로웨이스트" className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[#91a08e]" />
                <button type="submit" disabled={isLoading} className="rounded-lg bg-[#2f843d] px-3 py-2 text-xs font-bold text-white disabled:bg-[#abc5a7]">검색</button>
              </form>
              <div className="mt-4 flex gap-2 overflow-x-auto">
                {categories.map((category) => (
                  <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold ${activeCategory === category ? "bg-[#2f843d] text-white" : "bg-[#edf5e9] text-[#527650]"}`}>{category}</button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-[#839080]">{isLoading ? "장소를 불러오는 중…" : `${visiblePlaces.length}개 표시${tookMs !== null ? ` · ${tookMs.toLocaleString()}ms` : ""}`}</p>
            </div>

            <div className="max-h-[520px] overflow-y-auto p-3">
              {error && <p className="rounded-2xl bg-[#fff5f0] p-4 text-sm text-[#8c4934]">{error}</p>}
              {!isLoading && !error && visiblePlaces.length === 0 && <p className="p-5 text-center text-sm text-[#778575]">조건에 맞는 좌표 장소를 찾지 못했어요.</p>}
              {visiblePlaces.map((place) => (
                <button key={place.id} type="button" onClick={() => selectPlace(place.id)} className={`mb-2 w-full rounded-2xl p-4 text-left transition ${activePlace?.id === place.id ? "bg-[#edf8e8] ring-1 ring-[#75b966]" : "hover:bg-[#f7faf5]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-xs font-bold text-[#55944c]">{place.category}</p><h2 className="mt-1 truncate font-bold text-[#254626]">{place.name}</h2><p className="mt-2 text-xs leading-5 text-[#758473]">{place.address}</p></div>
                    <span className="text-lg">📍</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-[#3e7e40]">{place.distanceKm !== null ? `${place.distanceKm}km · ` : ""}{place.benefit}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="order-1 relative min-h-[520px] overflow-hidden bg-[#e9f2e6] lg:order-2">
            <KakaoMap places={visiblePlaces} selectedId={activePlace?.id ?? null} onSelect={selectPlace} routePath={routePath} userLocation={userLocation} />
            {activePlace && (
              <article className="absolute bottom-5 left-5 right-5 rounded-2xl bg-white p-5 shadow-lg sm:left-auto sm:w-80">
                <p className="text-xs font-bold text-[#54944f]">{activePlace.category}</p>
                <h2 className="mt-1 text-lg font-bold">{activePlace.name}</h2>
                <p className="mt-2 text-sm text-[#6d806b]">{activePlace.address}</p>
                <div className="mt-4 rounded-xl bg-[#f1f8ed] p-3 text-xs font-medium leading-5 text-[#387c3f]">🌱 {activePlace.benefit}</div>
                <button type="button" onClick={() => void startRoute(activePlace)} disabled={isRouting} className="mt-4 w-full rounded-xl bg-[#2f843d] py-3 text-sm font-bold text-white disabled:bg-[#a7bea4]">{isRouting ? "경로 계산 중…" : userLocation ? "현재 위치에서 경로 다시 보기" : "현재 위치에서 경로 보기"}</button>
                {routeSummary && <p className="mt-2 text-center text-xs font-bold text-[#347d40]">🚗 {routeSummary}</p>}
                {routeError && <p className="mt-2 rounded-lg bg-[#fff5f0] px-3 py-2 text-[11px] leading-4 text-[#8c4934]">{routeError}</p>}
                <div className="mt-3 flex items-center justify-center gap-3 text-[11px] font-semibold">
                  <a href={`https://map.kakao.com/link/to/${encodeURIComponent(activePlace.name)},${activePlace.latitude},${activePlace.longitude}`} target="_blank" rel="noreferrer" className="text-[#347d40] hover:underline">카카오맵에서 열기 ↗</a>
                  {activePlace.sourceUrl && <a href={activePlace.sourceUrl} target="_blank" rel="noreferrer" className="text-[#6d806b] hover:underline">공식 출처 ↗</a>}
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
