export type MissionRecommendationInput = {
  clientRequestId: string;
  limit?: number;
  mode?: "interests" | "general";
};
export type MissionRecommendationItem = {
  itemId: string;
  position: number;
  programKey: string;
  actionId: string;
  identityBasis: string;
  programTitle: string;
  programSummary: string;
  programStatusRaw: string;
  conditionCount: number;
  matchedInterestIds: string[];
  eligibilityStatus: "not_evaluated";
  locationStatus: "unknown";
  relatedPlaceCount: number;
};
export type MissionRecommendationBatch = {
  batchId: string;
  algorithmVersion: "interest-mapped-catalog-order-v1" | "interest-mapped-unseen-first-v2";
  selectionBasis: "selected_interests" | "catalog_exploration";
  createdAt: string;
  items: MissionRecommendationItem[];
};
export const missionEventTypes = [
  "impression", "detail_view", "accepted", "self_reported_completed", "map_open", "route_open",
] as const;
export type MissionEventInput = {
  clientEventId: string;
  batchId: string;
  itemId: string;
  eventType: typeof missionEventTypes[number];
  occurredAt: string;
};
export type MissionEvent = MissionEventInput & { eventId: string; recordedAt: string };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => key in value);
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isTimestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value));
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 10_000;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export function isMissionRecommendationInput(value: unknown): value is MissionRecommendationInput {
  return record(value) && (exact(value, ["clientRequestId"])
      || exact(value, ["clientRequestId", "limit"])
      || exact(value, ["clientRequestId", "mode"])
      || exact(value, ["clientRequestId", "limit", "mode"]))
    && isUuid(value.clientRequestId) && (value.limit === undefined
      || (Number.isInteger(value.limit) && Number(value.limit) >= 1 && Number(value.limit) <= 20))
    && (value.mode === undefined || value.mode === "interests" || value.mode === "general");
}
function isItem(value: unknown): value is MissionRecommendationItem {
  if (!record(value) || !exact(value, [
    "itemId", "position", "programKey", "actionId", "identityBasis", "programTitle", "programSummary",
    "programStatusRaw", "conditionCount", "matchedInterestIds", "eligibilityStatus", "locationStatus", "relatedPlaceCount",
  ])) return false;
  return isUuid(value.itemId) && count(value.position) && text(value.programKey) && text(value.actionId) && text(value.identityBasis)
    && text(value.programTitle) && text(value.programSummary) && text(value.programStatusRaw) && count(value.conditionCount)
    && Array.isArray(value.matchedInterestIds) && value.matchedInterestIds.every(text)
    && new Set(value.matchedInterestIds).size === value.matchedInterestIds.length
    && value.eligibilityStatus === "not_evaluated" && value.locationStatus === "unknown"
    && count(value.relatedPlaceCount);
}
export function isMissionRecommendationBatch(value: unknown): value is MissionRecommendationBatch {
  if (!record(value) || !exact(value, ["batchId", "algorithmVersion", "selectionBasis", "createdAt", "items"])
    || !isUuid(value.batchId) || !["interest-mapped-catalog-order-v1", "interest-mapped-unseen-first-v2"].includes(String(value.algorithmVersion))
    || !["selected_interests", "catalog_exploration"].includes(String(value.selectionBasis)) || !isTimestamp(value.createdAt)
    || !Array.isArray(value.items) || !value.items.every(isItem)) return false;
  return value.items.every((item, index) => item.position === index)
    && new Set(value.items.map(item => item.itemId)).size === value.items.length;
}
export function isMissionEventInput(value: unknown): value is MissionEventInput {
  return record(value) && exact(value, ["clientEventId", "batchId", "itemId", "eventType", "occurredAt"])
    && isUuid(value.clientEventId) && isUuid(value.batchId) && isUuid(value.itemId)
    && missionEventTypes.includes(value.eventType as typeof missionEventTypes[number]) && isTimestamp(value.occurredAt);
}
export function isMissionEvent(value: unknown): value is MissionEvent {
  return record(value) && exact(value, ["eventId", "clientEventId", "batchId", "itemId", "eventType", "occurredAt", "recordedAt"])
    && isUuid(value.eventId) && isMissionEventInput({
      clientEventId: value.clientEventId, batchId: value.batchId, itemId: value.itemId,
      eventType: value.eventType, occurredAt: value.occurredAt,
    })
    && isTimestamp(value.recordedAt);
}
