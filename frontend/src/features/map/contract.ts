// Existing FastAPI/Kakao wire formats. No database or recommendation changes.
export type RoutePoint = { latitude: number; longitude: number };
export type EcoPlace = RoutePoint & { id: string; name: string; benefit?: string };
export type Place = EcoPlace & { category: string; address: string; benefit: string; sourceUrl: string | null; distanceKm: number | null };
export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
export const validCoordinate = (latitude: unknown, longitude: unknown): boolean =>
  typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
  && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
export const point = (value: unknown): value is RoutePoint => object(value) && validCoordinate(value.latitude, value.longitude);
export const jsonType = (headers: Headers) => /^application\/json(?:\s*;|$)/i.test(headers.get("Content-Type") ?? "");

export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const messages: Record<string, string> = {
  INVALID_INPUT: "검색 조건과 좌표를 확인해 주세요.",
  INVALID_RESPONSE: "지도 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  UNAVAILABLE: "지도 정보 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  TIMEOUT: "지도 정보를 기다리는 시간이 초과됐어요. 다시 시도해 주세요.",
  CANCELLED: "요청이 취소됐어요.",
  NO_ROUTE: "이동 가능한 경로를 찾지 못했어요.",
  QA_AUTH_REQUIRED: "공유 페이지 접속 인증을 확인해 주세요. 페이지를 새로고침해 주세요.",
  LOCATION_DENIED: "위치 권한이 꺼져 있어요. 장소 목록과 외부 지도는 계속 사용할 수 있어요.",
  LOCATION_TIMEOUT: "현재 위치를 확인하는 시간이 초과됐어요. 다시 시도해 주세요.",
  LOCATION_UNAVAILABLE: "현재 위치를 확인하지 못했어요. 장소 목록과 외부 지도는 계속 사용할 수 있어요.",
};
export class MapError extends Error {
  readonly code: string;
  constructor(code: string) { super(Object.hasOwn(messages, code) ? messages[code] : messages.UNAVAILABLE); this.code = code; }
}
export const mapErrorMessage = (error: unknown) => error instanceof MapError ? error.message : messages.UNAVAILABLE;
export const mapFailure = (status: number, code: string) => Response.json({ error: new MapError(code).message, code },
  { status, headers: { "Cache-Control": "no-store" } });

type PlaceResult = { docId: string; title: string; summary: string; category: string | null; address: string | null;
  sourceUrl: string | null; latitude: number | null; longitude: number | null; distanceKm: number | null };
const nullableText = (value: unknown) => value === null || typeof value === "string";
export function readPlaces(value: unknown): { results: PlaceResult[]; meta: { resultCount: number; tookMs: number } } {
  if (!object(value) || !Array.isArray(value.results) || !object(value.meta)
    || !nonnegative(value.meta.resultCount) || !Number.isInteger(value.meta.resultCount) || !nonnegative(value.meta.tookMs)) throw new MapError("INVALID_RESPONSE");
  const results = value.results.map((item): PlaceResult => {
    if (!object(item) || typeof item.docId !== "string" || !item.docId.trim() || typeof item.title !== "string" || !item.title.trim()
      || typeof item.summary !== "string" || !nullableText(item.category) || !nullableText(item.address)
      || !(item.latitude === null && item.longitude === null) && !validCoordinate(item.latitude, item.longitude)
      || item.distanceKm != null && !nonnegative(item.distanceKm)) throw new MapError("INVALID_RESPONSE");
    return { docId: item.docId, title: item.title, summary: item.summary, category: item.category as string | null,
      address: item.address as string | null, sourceUrl: safeSourceUrl(item.sourceUrl), latitude: item.latitude as number | null,
      longitude: item.longitude as number | null, distanceKm: item.distanceKm == null ? null : item.distanceKm as number };
  });
  return { results, meta: { resultCount: value.meta.resultCount, tookMs: value.meta.tookMs } };
}
export function readRoute(value: unknown) {
  if (!object(value) || !Array.isArray(value.path) || value.path.length < 2 || !value.path.every(point)
    || value.distanceMeters != null && !nonnegative(value.distanceMeters)
    || value.durationSeconds != null && !nonnegative(value.durationSeconds)) throw new MapError("INVALID_RESPONSE");
  return { path: value.path as RoutePoint[], distanceMeters: value.distanceMeters == null ? null : value.distanceMeters as number,
    durationSeconds: value.durationSeconds == null ? null : value.durationSeconds as number };
}
