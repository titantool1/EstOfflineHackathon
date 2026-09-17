import test from "node:test";
import assert from "node:assert/strict";
import {
  hasActualInterests,
  matchesMissionPane,
  missionBoardHref,
  missionRouteHref,
  parseMissionPageQuery,
  restoreLegacyContext,
  safeMissionReturnHref,
  updateMissionContext,
} from "../src/features/missions/return-context.ts";
import { initialMissionViewState, missionViewReducer } from "../src/features/missions/state.ts";
import { createMissionClient } from "../src/features/missions/client.ts";
import type { MissionRecommendationBatch } from "../src/features/missions/contract.ts";

const interestBatchId = "00000000-0000-4000-8000-000000000001";
const interestItemId = "00000000-0000-4000-8000-000000000002";
const generalBatchId = "00000000-0000-4000-8000-000000000003";
const generalItemId = "00000000-0000-4000-8000-000000000004";
const interests = { batchId: interestBatchId, itemId: interestItemId };
const general = { batchId: generalBatchId, itemId: generalItemId };

test("canonical mission URL retains two complete pane positions and ignores incomplete or invalid pairs", () => {
  const parsed = parseMissionPageQuery({
    interestBatchId, interestItemId, generalBatchId, generalItemId,
  });
  assert.deepEqual(parsed.context, { interests, general });
  assert.equal(missionBoardHref(parsed.context),
    `/missions?interestBatchId=${interestBatchId}&interestItemId=${interestItemId}`
    + `&generalBatchId=${generalBatchId}&generalItemId=${generalItemId}`);
  assert.deepEqual(parseMissionPageQuery({ interestBatchId, generalBatchId, generalItemId: "bad" }).context, {});
  assert.deepEqual(parseMissionPageQuery({ batchId: generalBatchId, itemId: generalItemId }).legacy, general);
});

test("return context accepts only local missions URLs with UUID-only complete pane pairs", () => {
  const canonical = missionBoardHref({ interests, general });
  assert.equal(safeMissionReturnHref(canonical, interests), canonical);
  const reordered = `/missions?generalItemId=${generalItemId}&generalBatchId=${generalBatchId}`;
  assert.equal(safeMissionReturnHref(reordered, interests), missionBoardHref({ general }));
  const fallback = `/missions?batchId=${interestBatchId}&itemId=${interestItemId}`;
  for (const unsafe of [
    "https://evil.test/missions", "//evil.test/missions", "/profile",
    `/missions?generalBatchId=${generalBatchId}`,
    `/missions?generalBatchId=${generalBatchId}&generalItemId=${generalItemId}&next=https://evil.test`,
  ]) assert.equal(safeMissionReturnHref(unsafe, interests), fallback);
  const detail = missionRouteHref("/missions/detail", general, canonical);
  const detailUrl = new URL(detail, "https://eco.test");
  assert.equal(detailUrl.searchParams.get("batchId"), generalBatchId);
  assert.equal(detailUrl.searchParams.get("itemId"), generalItemId);
  assert.equal(detailUrl.searchParams.get("returnTo"), canonical);
});

test("actual saved interests activate two panes while empty or unsure profiles stay general-only", () => {
  assert.equal(hasActualInterests(["eco-learning"]), true);
  assert.equal(hasActualInterests([]), false);
  assert.equal(hasActualInterests(["unsure"]), false);
  assert.deepEqual(restoreLegacyContext({ interests, general }, undefined, undefined, false), { general });
  assert.deepEqual(restoreLegacyContext({}, interests, "selected_interests", true), { interests });
  assert.deepEqual(restoreLegacyContext({}, general, "catalog_exploration", true), { general });
  assert.deepEqual(restoreLegacyContext({}, interests, "selected_interests", false), {});
});

test("pane context and card state move independently", () => {
  const first = updateMissionContext({ interests, general }, "interests", {
    batchId: interestBatchId, itemId: generalItemId,
  });
  assert.deepEqual(first.general, general);
  assert.deepEqual(updateMissionContext(first, "interests"), { general });
  assert.equal(matchesMissionPane("interests", "selected_interests"), true);
  assert.equal(matchesMissionPane("general", "catalog_exploration"), true);
  assert.equal(matchesMissionPane("general", "selected_interests"), false);

  const batch = (batchId: string, itemA: string, itemB: string): MissionRecommendationBatch => ({
    batchId, algorithmVersion: "interest-mapped-catalog-order-v1", selectionBasis: "catalog_exploration",
    createdAt: "2026-09-18T00:00:00Z", items: [itemA, itemB].map((itemId, position) => ({
      itemId, position, programKey: "program", actionId: `action-${position}`, identityBasis: "raw",
      programTitle: "title", programSummary: "summary", programStatusRaw: "unknown", conditionCount: 0,
      matchedInterestIds: [], eligibilityStatus: "not_evaluated", locationStatus: "unknown", relatedPlaceCount: 0,
    })),
  });
  let left = missionViewReducer(initialMissionViewState, { type: "begin", request: 1 });
  let right = missionViewReducer(initialMissionViewState, { type: "begin", request: 2 });
  left = missionViewReducer(left, { type: "loaded", request: 1,
    batch: batch(interestBatchId, interestItemId, generalItemId) });
  right = missionViewReducer(right, { type: "loaded", request: 2,
    batch: batch(generalBatchId, generalItemId, interestItemId) });
  const untouched = right;
  left = missionViewReducer(left, { type: "next" });
  assert.equal(left.kind === "ready" ? left.index : -1, 1);
  assert.strictEqual(right, untouched);
});

test("two recommendation calls keep independent request IDs and explicit modes", async () => {
  const bodies: unknown[] = [];
  const client = createMissionClient(async (input, init) => {
    if (String(input) === "/api/auth/csrf") return Response.json({
      data: { token: "csrf", headerName: "X-CSRF-TOKEN" }, error: null, requestId: "csrf-1",
    });
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    return Response.json({ data: {
      batchId: body.mode === "interests" ? interestBatchId : generalBatchId,
      algorithmVersion: "interest-mapped-catalog-order-v1",
      selectionBasis: body.mode === "interests" ? "selected_interests" : "catalog_exploration",
      createdAt: "2026-09-18T00:00:00Z", items: [],
    }, error: null, requestId: `request-${body.mode}` });
  });
  await Promise.all([
    client.recommend({ clientRequestId: interestItemId, mode: "interests" }),
    client.recommend({ clientRequestId: generalItemId, mode: "general" }),
  ]);
  assert.deepEqual((bodies as Array<{ mode: string }>).sort((a, b) => a.mode.localeCompare(b.mode)), [
    { clientRequestId: generalItemId, mode: "general" },
    { clientRequestId: interestItemId, mode: "interests" },
  ]);
});
