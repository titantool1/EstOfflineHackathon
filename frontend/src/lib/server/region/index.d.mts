export type RegionRole = 'search' | 'residence';
export type LocationKind = 'admin' | 'neighborhood' | 'place' | 'reference';
export type LocationInput = { text: string; role: RegionRole; kind: LocationKind };
export type ResolvedRegion = {
  status: 'resolved'; raw: string; role: RegionRole; sido: string; sigungu: string | null;
  precision: 'city' | 'district'; proof: { source: 'address' | 'keyword_coord'; [key: string]: unknown }; reused?: boolean;
};
export type UnresolvedRegion = {
  status: 'needs_clarification' | 'unavailable'; reason: string; raw: string; role: RegionRole;
};
export type RegionResult = {
  status: 'resolved' | 'needs_clarification' | 'unavailable'; reason?: string;
  locations: Partial<Record<RegionRole, ResolvedRegion | UnresolvedRegion>>;
};
export type PlaceCandidate = { id: string; place_name: string; address_name: string; category_name: string };
export type Maps = (path: 'search/address' | 'search/keyword' | 'geo/coord2regioncode', params: Record<string, string>) => Promise<unknown[]>;
export function normalizeLocations(text: string, locations: LocationInput[]): LocationInput[];
export function createRegionResolver(dependencies: {
  maps: Maps;
  selectPlace?: (input: { text: string; scope: string | null; candidates: PlaceCandidate[] }) => Promise<{ status: 'selected' | 'needs_clarification'; ids: string[] }>;
}): (input: {
  text: string; locations: LocationInput[]; scope?: string | null;
  previous?: Partial<Record<RegionRole, ResolvedRegion>>; allowedRoles?: RegionRole[];
}) => Promise<RegionResult>;
export function toSearchParams(result: RegionResult): { sido: string; sigungu: string } | null;
