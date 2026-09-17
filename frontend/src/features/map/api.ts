import { jsonType, MapError, object, readPlaces, readRoute, validCoordinate, type Place, type RoutePoint } from "./contract.ts";
export type { Place, RoutePoint, EcoPlace } from "./contract.ts";
export const mapApiPaths = { places: "/api/places", route: "/api/route" } as const;
const SEOUL_CENTER = { latitude: 37.5665, longitude: 126.978 };
type Options = { browseDistrict?: string; fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number };

async function request(path: string, body: unknown, options: Options, defaultTimeout: number): Promise<unknown> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? defaultTimeout);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await (options.fetch ?? fetch)(path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal, cache: "no-store", redirect: "error" });
    if (response.status === 401 && response.headers.get("WWW-Authenticate")?.includes('realm="eco-app-qa"')) throw new MapError("QA_AUTH_REQUIRED");
    if (!jsonType(response.headers)) throw new MapError("INVALID_RESPONSE");
    const payload: unknown = await response.json();
    if (!response.ok) throw new MapError(object(payload) && typeof payload.code === "string" ? payload.code : "UNAVAILABLE");
    return payload;
  } catch (error) {
    if (error instanceof MapError) throw error;
    throw new MapError(options.signal?.aborted ? "CANCELLED" : timeout.aborted ? "TIMEOUT" : error instanceof SyntaxError ? "INVALID_RESPONSE" : "UNAVAILABLE");
  }
}
export async function requestPlaces(query: string, options: Options = {}) {
  const payload = readPlaces(await request(mapApiPaths.places, { query, interpretRegion: Boolean(query.trim()), ...(options.browseDistrict ? { browseDistrict: options.browseDistrict } : {}), region: "서울특별시", ...SEOUL_CENTER, distanceKm: 30 }, options, 95_000));
  const places: Place[] = payload.results.flatMap(result => result.latitude === null || result.longitude === null ? [] : [{
    id: result.docId, name: result.title, category: result.category ?? "친환경 실천 장소", address: result.address ?? "주소 정보 없음",
    benefit: result.summary, sourceUrl: result.sourceUrl, distanceKm: result.distanceKm, latitude: result.latitude, longitude: result.longitude,
  }]);
  return { places, tookMs: payload.meta.tookMs, region: payload.meta.region ?? null };
}
export async function requestRoute(origin: RoutePoint, destination: RoutePoint, options: Options = {}) {
  return readRoute(await request(mapApiPaths.route, { origin, destination: { latitude: destination.latitude, longitude: destination.longitude } }, options, 20_000));
}

// Display coordinates are not evidence of a saved place or a member's residence.
export function targetFromSearch(search: string): Place | null {
  const params = new URLSearchParams(search);
  const lat = params.get("lat"), lng = params.get("lng");
  const latitude = Number(lat), longitude = Number(lng);
  const id = params.get("placeId")?.trim(), name = params.get("name")?.trim();
  if (!id || !name || !lat?.trim() || !lng?.trim() || !validCoordinate(latitude, longitude)) return null;
  return { id, name, latitude, longitude, address: params.get("address") ?? "주소 정보 없음",
    category: params.get("category") ?? "친환경 실천 장소", benefit: "전달받은 장소예요. 방문 전 운영 여부와 혜택을 확인해 주세요.", sourceUrl: null, distanceKm: null };
}
export function currentLocation(): Promise<RoutePoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new MapError("LOCATION_UNAVAILABLE")); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      if (!validCoordinate(latitude, longitude)) reject(new MapError("LOCATION_UNAVAILABLE"));
      else resolve({ latitude, longitude });
    }, error => reject(new MapError(error.code === 1 ? "LOCATION_DENIED" : error.code === 3 ? "LOCATION_TIMEOUT" : "LOCATION_UNAVAILABLE")),
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
  });
}
