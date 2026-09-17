import test from "node:test";
import assert from "node:assert/strict";
import { createMissionDetailHandler } from "../src/lib/server/mission-detail-bff.ts";
import type { MissionDetailSpring } from "../src/lib/server/mission-detail-spring.ts";
import type { MissionRecommendationBatch } from "../src/features/missions/contract.ts";
import type { CatalogDetail } from "../src/lib/server/catalog-client.ts";

const batchId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const otherItemId = "00000000-0000-4000-8000-000000000003";
const requestId = "mission-detail-1";
const batch: MissionRecommendationBatch = {
  batchId,
  algorithmVersion: "interest-mapped-catalog-order-v1",
  selectionBasis: "catalog_exploration",
  createdAt: "2026-09-17T01:00:00Z",
  items: [{
    itemId, position: 0, programKey: "district:S02", actionId: "candidate:S02",
    identityBasis: "catalog action", programTitle: "교환 장소", programSummary: "원문",
    programStatusRaw: "확인 필요", conditionCount: 1, matchedInterestIds: [],
    eligibilityStatus: "not_evaluated", locationStatus: "unknown", relatedPlaceCount: 2,
  }],
};
const detail = {
  program_key: "district:S02", action_id: "candidate:S02", title: "교환 장소",
  identity_basis: "catalog action", program_status: "확인 필요", program: { benefit: "원문 혜택" },
  overview_sources: [], conditions: [], eligibility_status: "not_evaluated",
  places: [{
    place_id: "S02:new", title: "새 장소", address: "서울 중구 세종대로 1", district: "중구",
    service_key: "exchange", schedule: { weekday: "Thursday", hours: "15:00-19:00" },
    status: "unknown", announced_start: "2026-03-19", announced_end_exclusive: null,
    source: { id: "S02-S01", url: "https://example.test/source", title: "공식 출처" },
  }],
} as CatalogDetail;

const success = <T>(data: T) => ({ status: 200, body: { data, error: null, requestId } });
const error = (status: number, code: string) => ({
  status, body: { data: null, error: { code, message: "조회 실패" }, requestId },
});

test("BFF resolves the owned batch item before catalog detail and preserves composite identity", async () => {
  const calls: unknown[][] = [];
  const spring: MissionDetailSpring = {
    async getBatch(id, correlation, cookie, signal) {
      calls.push(["batch", id, correlation, cookie, signal instanceof AbortSignal]);
      return success(batch);
    },
    async getCatalogDetail(programKey, actionId, correlation, signal) {
      calls.push(["detail", programKey, actionId, correlation, signal instanceof AbortSignal]);
      return success(detail);
    },
  };
  const handler = createMissionDetailHandler({ spring });
  const request = new Request(`https://eco.test/api/missions/recommendations/${batchId}/items/${itemId}/detail`, {
    headers: { Cookie: "ECOTEAMSESSION=owner", "X-Request-Id": requestId, "X-User-Id": "forged" },
  });
  const reply = await handler(request, batchId, itemId);
  assert.equal(reply.status, 200);
  const envelope = await reply.json();
  assert.deepEqual(envelope.data, { batchId, itemId, detail });
  assert.deepEqual(calls, [
    ["batch", batchId, requestId, "ECOTEAMSESSION=owner", true],
    ["detail", "district:S02", "candidate:S02", requestId, true],
  ]);
  assert.equal(reply.headers.get("Cache-Control"), "no-store");
});

test("unknown item is 404 without catalog lookup and invalid IDs are rejected before Spring", async () => {
  let detailCalls = 0;
  const spring: MissionDetailSpring = {
    async getBatch() { return success(batch); },
    async getCatalogDetail() { detailCalls++; return success(detail); },
  };
  const handler = createMissionDetailHandler({ spring });
  assert.equal((await handler(new Request("https://eco.test"), batchId, otherItemId)).status, 404);
  assert.equal((await handler(new Request("https://eco.test"), "bad", itemId)).status, 400);
  assert.equal(detailCalls, 0);
});

test("owner/batch and catalog failures stay failures rather than empty details", async () => {
  let catalogCalls = 0;
  const missingOwner: MissionDetailSpring = {
    async getBatch() { return error(404, "RESOURCE_NOT_FOUND"); },
    async getCatalogDetail() { catalogCalls++; return success(detail); },
  };
  let reply = await createMissionDetailHandler({ spring: missingOwner })(new Request("https://eco.test"), batchId, itemId);
  assert.equal(reply.status, 404);
  assert.equal((await reply.json()).error.code, "RESOURCE_NOT_FOUND");
  assert.equal(catalogCalls, 0);

  const failedCatalog: MissionDetailSpring = {
    async getBatch() { return success(batch); },
    async getCatalogDetail() { return error(503, "DATABASE_UNAVAILABLE"); },
  };
  reply = await createMissionDetailHandler({ spring: failedCatalog })(new Request("https://eco.test"), batchId, itemId);
  assert.equal(reply.status, 503);
  assert.equal((await reply.json()).error.code, "DATABASE_UNAVAILABLE");
});
