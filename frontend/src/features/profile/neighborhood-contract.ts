export type Neighborhood = { regionCode: string; sido: string; sigungu: string; dong: string };
export type EmptyReason = "NO_RESULTS" | "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED" | null;
export type ResolveResult = { candidates: Neighborhood[]; hasMore: boolean; emptyReason: EmptyReason };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function isNeighborhood(value: unknown): value is Neighborhood {
  return record(value) && Object.keys(value).length === 4
    && ["regionCode", "sido", "sigungu", "dong"].every(key => key in value)
    && typeof value.regionCode === "string" && /^[0-9]{10}$/.test(value.regionCode)
    && typeof value.sido === "string" && value.sido.length > 0 && value.sido.length <= 40 && value.sido === value.sido.trim()
    && typeof value.sigungu === "string" && value.sigungu.length <= 80 && value.sigungu === value.sigungu.trim()
    && typeof value.dong === "string" && value.dong.length > 0 && value.dong.length <= 80 && value.dong === value.dong.trim()
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value.sido + value.sigungu + value.dong);
}

export function isNeighborhoodView(value: unknown): value is { neighborhood: Neighborhood | null } {
  return record(value) && (value.neighborhood === null || isNeighborhood(value.neighborhood));
}

export function isResolveResult(value: unknown): value is ResolveResult {
  return record(value) && Array.isArray(value.candidates) && value.candidates.every(isNeighborhood)
    && typeof value.hasMore === "boolean"
    && (value.emptyReason === null || value.emptyReason === "NO_RESULTS"
      || value.emptyReason === "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED");
}

export function neighborhoodLabel(value: Neighborhood) {
  return [value.sido, value.sigungu, value.dong].filter(Boolean).join(" ");
}
