import "server-only";
import type { Neighborhood, ResolveResult } from "../../features/profile/neighborhood-contract.ts";

const ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";
const COORDINATE_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export class KakaoLocalError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

function candidate(value: unknown, coordinate: boolean): Neighborhood | null {
  if (!record(value)) return null;
  const source = coordinate ? value : value.address;
  if (!record(source)) return null;
  if (coordinate && value.region_type !== "H") return null;
  const regionCode = coordinate ? source.code : source.h_code;
  const sido = source.region_1depth_name;
  const sigungu = source.region_2depth_name;
  const dong = coordinate ? source.region_3depth_name : source.region_3depth_h_name;
  if (typeof regionCode !== "string" || !/^[0-9]{10}$/.test(regionCode)
      || typeof sido !== "string" || !sido || sido.length > 40
      || typeof sigungu !== "string" || sigungu.length > 80
      || typeof dong !== "string" || !dong || dong.length > 80) return null;
  return { regionCode, sido, sigungu, dong };
}

function unique(values: Neighborhood[]) {
  const seen = new Set<string>();
  return values.filter(value => !seen.has(value.regionCode) && Boolean(seen.add(value.regionCode)));
}

// A region name may cover several administrative neighborhoods. Its point is
// only a candidate source; the UI must disclose this and require selection.
function addressPoint(value: unknown): { latitude: number; longitude: number } | null {
  if (!record(value) || !["REGION", "REGION_ADDR", "ROAD_ADDR"].includes(String(value.address_type))
      || !record(value.address) || typeof value.address.region_3depth_name !== "string"
      || !value.address.region_3depth_name.trim()) return null;
  const coordinate = (value: unknown) => typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : NaN;
  const longitude = coordinate(value.x), latitude = coordinate(value.y);
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? { latitude, longitude } : null;
}

export function createKakaoLocal(config: { apiKey: string | undefined; fetch?: typeof fetch; timeoutMs?: number }) {
  const fetcher = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 5_000;
  async function request(url: URL): Promise<unknown> {
    if (!config.apiKey) throw new KakaoLocalError(503, "KAKAO_NOT_CONFIGURED", "동네 검색 설정을 확인해 주세요.");
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const reply = await fetcher(url, { headers: { Authorization: `KakaoAK ${config.apiKey}`, Accept: "application/json" },
        signal: timeout, cache: "no-store", redirect: "error" });
      if (!reply.ok) throw new KakaoLocalError(503, "KAKAO_UNAVAILABLE", "동네 검색 서비스에 연결할 수 없어요.");
      if (!/^application\/json(?:\s*;|$)/i.test(reply.headers.get("Content-Type") ?? ""))
        throw new KakaoLocalError(503, "KAKAO_INVALID_RESPONSE", "동네 검색 응답을 확인할 수 없어요.");
      return await reply.json();
    } catch (error) {
      if (error instanceof KakaoLocalError) throw error;
      if (timeout.aborted) throw new KakaoLocalError(504, "KAKAO_TIMEOUT", "동네 검색 시간이 초과됐어요.");
      throw new KakaoLocalError(503, "KAKAO_UNAVAILABLE", "동네 검색 서비스에 연결할 수 없어요.");
    }
  }
  async function coordinates(latitude: number, longitude: number): Promise<ResolveResult> {
    const url = new URL(COORDINATE_URL); url.searchParams.set("x", String(longitude)); url.searchParams.set("y", String(latitude));
    const raw = await request(url);
    if (!record(raw) || !Array.isArray(raw.documents))
      throw new KakaoLocalError(503, "KAKAO_INVALID_RESPONSE", "동네 검색 응답을 확인할 수 없어요.");
    const candidates = unique(raw.documents.map(value => candidate(value, true)).filter((value): value is Neighborhood => value !== null));
    return { candidates, hasMore: false, emptyReason: candidates.length ? null
      : raw.documents.length ? "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED" : "NO_RESULTS" };
  }
  return {
    async search(query: string): Promise<ResolveResult> {
      const url = new URL(ADDRESS_URL); url.searchParams.set("query", query); url.searchParams.set("size", "30"); url.searchParams.set("page", "1");
      const raw = await request(url);
      if (!record(raw) || !Array.isArray(raw.documents) || !record(raw.meta) || typeof raw.meta.is_end !== "boolean")
        throw new KakaoLocalError(503, "KAKAO_INVALID_RESPONSE", "동네 검색 응답을 확인할 수 없어요.");
      const candidates = unique(raw.documents.map(value => candidate(value, false)).filter((value): value is Neighborhood => value !== null));
      if (!candidates.length) {
        const points = raw.documents.map(addressPoint).filter((point): point is NonNullable<ReturnType<typeof addressPoint>> => point !== null);
        const resolved = await Promise.all(points.slice(0, 5).map(point => coordinates(point.latitude, point.longitude)));
        const fromPoints = unique(resolved.flatMap(result => result.candidates));
        if (fromPoints.length) return { candidates: fromPoints, hasMore: !raw.meta.is_end || points.length > 5,
          emptyReason: null, usedAddressPoint: true };
      }
      return { candidates, hasMore: !raw.meta.is_end, emptyReason: candidates.length ? null
        : raw.documents.length ? "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED" : "NO_RESULTS" };
    },
    coordinates,
  };
}
