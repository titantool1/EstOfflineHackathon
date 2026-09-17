import "server-only";
import { isPlaceSource } from "../../features/missions/place-source.ts";
import { createSpringClient } from "./spring-client.ts";

export type JsonObject = Record<string, unknown>;
export type CatalogCandidate = {
  program_key: string; action_id: string; title: string; identity_basis: string;
  program_status: string | null; catalog_district: string | null; condition_labels: string[];
};
export type CatalogSearch = {
  query: string; match_mode: "hybrid_rrf"; offset: number; limit: number;
  has_more: boolean; items: CatalogCandidate[];
};
export type CatalogSource = JsonObject & { id: string; url: string; title: string };
export type CatalogDetail = JsonObject & {
  program_key: string; action_id: string; title: string; identity_basis: string;
  program_status: string | null; program: JsonObject; overview_sources: CatalogSource[];
  conditions: (JsonObject & { condition: JsonObject; sources: CatalogSource[]; common_groups: JsonObject[]; mapping_basis: string })[];
  places: (JsonObject & { place_id: string; title: string; address: string; service_key: string; source: CatalogSource })[];
  eligibility_status: "not_evaluated";
};
export function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const nullableText = (v: unknown) => v === null || typeof v === "string";
function source(v: unknown): v is CatalogSource {
  if (!object(v) || !text(v.id) || !text(v.url) || !text(v.title)) return false;
  try { return ["http:", "https:"].includes(new URL(v.url).protocol); } catch { return false; }
}
function candidate(v: unknown): v is CatalogCandidate {
  return object(v) && text(v.program_key) && text(v.action_id) && text(v.title) && text(v.identity_basis)
    && nullableText(v.program_status) && nullableText(v.catalog_district)
    && Array.isArray(v.condition_labels) && v.condition_labels.every(text);
}
export function isCatalogSearch(v: unknown): v is CatalogSearch {
  if (!object(v) || !text(v.query) || v.match_mode !== "hybrid_rrf"
      || !Number.isInteger(v.offset) || !Number.isInteger(v.limit) || typeof v.has_more !== "boolean"
      || !Array.isArray(v.items) || !v.items.every(candidate)) return false;
  return new Set(v.items.map(x => JSON.stringify([x.program_key, x.action_id]))).size === v.items.length;
}
export function isCatalogDetail(v: unknown): v is CatalogDetail {
  return object(v) && text(v.program_key) && text(v.action_id) && text(v.title) && text(v.identity_basis)
    && nullableText(v.program_status) && v.eligibility_status === "not_evaluated" && object(v.program)
    && Array.isArray(v.overview_sources) && v.overview_sources.every(source)
    && Array.isArray(v.conditions) && v.conditions.every(c => object(c) && object(c.condition)
      && text(c.condition.id) && Array.isArray(c.sources) && c.sources.every(source)
      && Array.isArray(c.common_groups) && c.common_groups.every(object) && text(c.mapping_basis))
    && Array.isArray(v.places) && v.places.every(p => object(p) && text(p.place_id) && text(p.title)
      && typeof p.address === "string" && text(p.service_key) && isPlaceSource(p.source, p.relation_type)
      && (p.status === null || p.status === "unknown" || p.status === "closed")
      && "schedule" in p && "announced_start" in p && "announced_end_exclusive" in p);
}

export function createCatalogClient(client: ReturnType<typeof createSpringClient>) {
  return {
    search(query: string, embedding: number[], limit: number, offset: number, requestId?: string, signal?: AbortSignal) {
      return client.request<CatalogSearch>("/api/catalog/actions/search", {
        method: "POST", body: { query, embedding, limit, offset }, requestId, signal, csrf: true,
        validate: (v): v is CatalogSearch => isCatalogSearch(v) && v.query === query
          && v.limit === limit && v.offset === offset && v.items.length <= limit,
      });
    },
    detail(programKey: string, actionId: string, requestId?: string, signal?: AbortSignal) {
      return client.request<CatalogDetail>("/api/catalog/actions/detail", {
        query: { programKey, actionId }, requestId, signal,
        validate: (v): v is CatalogDetail => isCatalogDetail(v)
          && v.program_key === programKey && v.action_id === actionId,
      });
    },
  };
}
