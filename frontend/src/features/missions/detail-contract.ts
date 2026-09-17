import { isUuid } from "./contract.ts";

export type MissionSource = {
  id: string;
  url: string;
  title: string;
  [key: string]: unknown;
};

export type MissionCondition = {
  condition: Record<string, unknown>;
  sources: MissionSource[];
  common_groups: Record<string, unknown>[];
  mapping_basis: string;
  [key: string]: unknown;
};

export type MissionPlace = {
  place_id: string;
  title: string;
  address: string;
  district: string | null;
  service_key: string;
  schedule: unknown;
  status: "unknown" | "closed" | null;
  announced_start: string | null;
  announced_end_exclusive: string | null;
  source: MissionSource;
  [key: string]: unknown;
};

export type MissionCatalogDetail = {
  program_key: string;
  action_id: string;
  identity_basis: string;
  title: string;
  program_status: string | null;
  program: Record<string, unknown>;
  overview_sources: MissionSource[];
  conditions: MissionCondition[];
  places: MissionPlace[];
  eligibility_status: "not_evaluated";
  [key: string]: unknown;
};

export type MissionItemDetail = {
  batchId: string;
  itemId: string;
  detail: MissionCatalogDetail;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const nullableText = (value: unknown) => value === null || typeof value === "string";

function isSource(value: unknown): value is MissionSource {
  return object(value) && text(value.id) && text(value.url) && text(value.title);
}

function isCondition(value: unknown): value is MissionCondition {
  return object(value) && object(value.condition) && text(value.condition.id)
    && Array.isArray(value.sources) && value.sources.every(isSource)
    && Array.isArray(value.common_groups) && value.common_groups.every(object)
    && text(value.mapping_basis);
}

function isPlace(value: unknown): value is MissionPlace {
  return object(value) && text(value.place_id) && text(value.title) && typeof value.address === "string"
    && nullableText(value.district) && text(value.service_key) && "schedule" in value
    && (value.status === null || value.status === "unknown" || value.status === "closed")
    && nullableText(value.announced_start) && nullableText(value.announced_end_exclusive)
    && isSource(value.source);
}

export function isMissionCatalogDetail(value: unknown): value is MissionCatalogDetail {
  return object(value) && text(value.program_key) && text(value.action_id) && text(value.identity_basis)
    && text(value.title) && nullableText(value.program_status) && object(value.program)
    && Array.isArray(value.overview_sources) && value.overview_sources.every(isSource)
    && Array.isArray(value.conditions) && value.conditions.every(isCondition)
    && Array.isArray(value.places) && value.places.every(isPlace)
    && value.eligibility_status === "not_evaluated";
}

export function isMissionItemDetail(value: unknown): value is MissionItemDetail {
  return object(value) && Object.keys(value).length === 3
    && isUuid(value.batchId) && isUuid(value.itemId) && isMissionCatalogDetail(value.detail);
}

export function missionReturnHref(batchId: string, itemId: string) {
  return `/missions?${new URLSearchParams({ batchId, itemId })}`;
}

export function kakaoAddressSearchHref(address: string) {
  const normalized = address.trim();
  return normalized ? `https://map.kakao.com/link/search/${encodeURIComponent(normalized)}` : null;
}

export function displayValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(displayValue).filter((part): part is string => part !== null);
    return parts.length ? parts.join(" · ") : null;
  }
  if (object(value)) {
    const parts = Object.entries(value).flatMap(([key, nested]) => {
      const shown = displayValue(nested);
      return shown ? [`${key}: ${shown}`] : [];
    });
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}
