import test from "node:test";
import assert from "node:assert/strict";
import { createMissionClient, MissionClientError } from "../src/features/missions/client.ts";
import {
  initialMissionViewState,
  missionCardUrl,
  missionEventInput,
  missionViewReducer,
} from "../src/features/missions/state.ts";
import type { MissionRecommendationBatch } from "../src/features/missions/contract.ts";

const requestId = "00000000-0000-4000-8000-000000000001";
const batchId = "00000000-0000-4000-8000-000000000002";
const firstItemId = "00000000-0000-4000-8000-000000000003";
const secondItemId = "00000000-0000-4000-8000-000000000004";
const eventId = "00000000-0000-4000-8000-000000000005";
const batch: MissionRecommendationBatch = {
  batchId,
  algorithmVersion: "interest-mapped-catalog-order-v1",
  selectionBasis: "selected_interests",
  createdAt: "2026-09-17T01:00:00Z",
  items: [firstItemId, secondItemId].map((itemId, position) => ({
    itemId, position, programKey: `program-${position}`, actionId: `action-${position}`,
    identityBasis: "raw", programTitle: `프로그램 ${position}`, programSummary: "원문 혜택",
    programStatusRaw: "운영 중", conditionCount: 1, matchedInterestIds: ["eco-learning"],
    eligibilityStatus: "not_evaluated", locationStatus: "unknown", relatedPlaceCount: position,
  })),
};
const envelope = (data: unknown, status = 200) => Response.json(
  { data: status < 400 ? data : null, error: status < 400 ? null : data, requestId: "browser-1" }, { status });

test("mission browser client uses fixed paths, CSRF for writes, and preserves caller event identity", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const occurredAt = "2026-09-17T02:03:04.123Z";
  const eventInput = missionEventInput(batchId, firstItemId, "impression", requestId, occurredAt);
  const event = { ...eventInput, eventId, recordedAt: "2026-09-17T02:03:05Z" };
  const client = createMissionClient(async (input, init) => {
    const path = String(input); calls.push({ path, init });
    if (path === "/api/auth/csrf") return envelope({ token: "csrf", headerName: "X-CSRF-TOKEN" });
    if (path === "/api/missions/events") return envelope(event);
    return envelope(batch);
  });

  assert.deepEqual(await client.recommend({ clientRequestId: requestId }), batch);
  assert.deepEqual(await client.getBatch(batchId), batch);
  assert.deepEqual(await client.recordEvent(eventInput), event);
  assert.deepEqual(calls.map(call => call.path), [
    "/api/auth/csrf", "/api/missions/recommendations",
    `/api/missions/recommendations/${batchId}`,
    "/api/auth/csrf", "/api/missions/events",
  ]);
  assert.equal(new Headers(calls[1].init?.headers).get("X-CSRF-TOKEN"), "csrf");
  assert.equal(calls[2].init?.method, undefined);
  assert.equal(new Headers(calls[4].init?.headers).get("X-CSRF-TOKEN"), "csrf");
  assert.deepEqual(JSON.parse(String(calls[4].init?.body)), eventInput);
});

test("mission client exposes server status, code, and message for explicit retry decisions", async () => {
  const client = createMissionClient(async input => String(input).endsWith("csrf")
    ? envelope({ token: "csrf", headerName: "X-CSRF-TOKEN" })
    : envelope({ code: "IMPRESSION_ALREADY_RECORDED", message: "이미 기록됨" }, 409));
  const input = missionEventInput(batchId, firstItemId, "impression", requestId, "2026-09-17T02:03:04Z");
  await assert.rejects(client.recordEvent(input), (error: unknown) => error instanceof MissionClientError
    && error.status === 409 && error.code === "IMPRESSION_ALREADY_RECORDED" && error.message === "이미 기록됨");
});

test("mission state ignores stale loads and moves locally through one fixed batch to its end", () => {
  let state = missionViewReducer(initialMissionViewState, { type: "begin", request: 1 });
  state = missionViewReducer(state, { type: "begin", request: 2 });
  const current = state;
  state = missionViewReducer(state, { type: "loaded", request: 1, batch });
  assert.strictEqual(state, current);
  state = missionViewReducer(state, { type: "loaded", request: 2, batch, itemId: secondItemId });
  assert.equal(state.kind, "ready");
  if (state.kind !== "ready") return;
  assert.equal(state.index, 1);
  state = missionViewReducer(state, { type: "next" });
  assert.equal(state.kind, "ended");
  state = missionViewReducer(state, { type: "back" });
  assert.equal(state.kind, "ready");
  assert.equal(state.kind === "ready" ? state.index : -1, 1);
  assert.equal(missionCardUrl(batchId, secondItemId), `/missions?batchId=${batchId}&itemId=${secondItemId}`);
});

test("event input keeps the supplied id and timestamp so a retry can reuse the exact payload", () => {
  const first = missionEventInput(batchId, firstItemId, "accepted", requestId, "2026-09-17T02:03:04Z");
  const retry = first;
  assert.strictEqual(retry, first);
  assert.deepEqual(retry, { clientEventId: requestId, batchId, itemId: firstItemId,
    eventType: "accepted", occurredAt: "2026-09-17T02:03:04Z" });
});
