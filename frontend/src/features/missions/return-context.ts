import { isUuid } from "./contract.ts";

export type MissionPane = "interests" | "general";
export type MissionPosition = { batchId: string; itemId: string };
export type MissionReturnContext = Partial<Record<MissionPane, MissionPosition>>;
export type MissionSelectionBasis = "selected_interests" | "catalog_exploration";
type Query = Record<string, string | string[] | undefined>;

const canonicalKeys = new Set([
  "interestBatchId", "interestItemId", "generalBatchId", "generalItemId",
]);

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pair(batchId: unknown, itemId: unknown): MissionPosition | undefined {
  return isUuid(batchId) && isUuid(itemId) ? { batchId, itemId } : undefined;
}

export function parseMissionPageQuery(query: Query): {
  context: MissionReturnContext;
  legacy?: MissionPosition;
} {
  const context: MissionReturnContext = {};
  const interests = pair(single(query.interestBatchId), single(query.interestItemId));
  const general = pair(single(query.generalBatchId), single(query.generalItemId));
  const legacy = pair(single(query.batchId), single(query.itemId));
  if (interests) context.interests = interests;
  if (general) context.general = general;
  return { context, legacy };
}

export function missionBoardHref(context: MissionReturnContext): string {
  const query = new URLSearchParams();
  if (context.interests) {
    query.set("interestBatchId", context.interests.batchId);
    query.set("interestItemId", context.interests.itemId);
  }
  if (context.general) {
    query.set("generalBatchId", context.general.batchId);
    query.set("generalItemId", context.general.itemId);
  }
  const encoded = query.toString();
  return encoded ? `/missions?${encoded}` : "/missions";
}

export function hasActualInterests(interestIds: string[]): boolean {
  return interestIds.some(id => id !== "unsure");
}

export function updateMissionContext(context: MissionReturnContext, pane: MissionPane,
  position?: MissionPosition): MissionReturnContext {
  const next = { ...context };
  if (position) next[pane] = position;
  else delete next[pane];
  return next;
}

export function restoreLegacyContext(context: MissionReturnContext, legacy: MissionPosition | undefined,
  basis: MissionSelectionBasis | undefined, actualInterests: boolean): MissionReturnContext {
  let restored = { ...context };
  if (legacy && basis) {
    if (basis === "catalog_exploration") restored = updateMissionContext(restored, "general", legacy);
    else if (actualInterests) restored = updateMissionContext(restored, "interests", legacy);
  }
  if (!actualInterests) restored = updateMissionContext(restored, "interests");
  return restored;
}

export function matchesMissionPane(pane: MissionPane, basis: MissionSelectionBasis): boolean {
  return pane === "interests" ? basis === "selected_interests" : basis === "catalog_exploration";
}

export function safeMissionReturnHref(value: string | undefined, fallback: MissionPosition): string {
  if (!value || !value.startsWith("/")) return legacyMissionHref(fallback);
  let url: URL;
  try { url = new URL(value, "https://missions.local"); } catch { return legacyMissionHref(fallback); }
  if (url.origin !== "https://missions.local" || url.pathname !== "/missions" || url.hash) return legacyMissionHref(fallback);
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => !canonicalKeys.has(key)) || new Set(keys).size !== keys.length)
    return legacyMissionHref(fallback);
  const interestPresent = url.searchParams.has("interestBatchId") || url.searchParams.has("interestItemId");
  const generalPresent = url.searchParams.has("generalBatchId") || url.searchParams.has("generalItemId");
  if ((interestPresent && (!isUuid(url.searchParams.get("interestBatchId")) || !isUuid(url.searchParams.get("interestItemId"))))
      || (generalPresent && (!isUuid(url.searchParams.get("generalBatchId")) || !isUuid(url.searchParams.get("generalItemId")))))
    return legacyMissionHref(fallback);
  const parsed = parseMissionPageQuery(Object.fromEntries(url.searchParams));
  const canonical = missionBoardHref(parsed.context);
  if (canonical === "/missions") return legacyMissionHref(fallback);
  return canonical;
}

export function missionRouteHref(pathname: "/missions/detail" | "/map/mission",
  position: MissionPosition, returnHref: string): string {
  const query = new URLSearchParams({
    batchId: position.batchId,
    itemId: position.itemId,
    returnTo: safeMissionReturnHref(returnHref, position),
  });
  return `${pathname}?${query.toString()}`;
}

export function legacyMissionHref(position: MissionPosition): string {
  if (!isUuid(position.batchId) || !isUuid(position.itemId)) return "/missions";
  const query = new URLSearchParams({ batchId: position.batchId, itemId: position.itemId });
  return `/missions?${query.toString()}`;
}
