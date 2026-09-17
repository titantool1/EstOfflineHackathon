import test from "node:test";
import assert from "node:assert/strict";
import {
  displayValue,
  isMissionItemDetail,
  kakaoAddressSearchHref,
  missionReturnHref,
} from "../src/features/missions/detail-contract.ts";
import {
  createMissionDetailClient,
  createViewEvent,
  MissionDetailClientError,
} from "../src/features/missions/detail-client.ts";

const batchId = "00000000-0000-4000-8000-000000000001";
const itemId = "00000000-0000-4000-8000-000000000002";
const detail = {
  batchId, itemId, detail: {
    program_key: "district:S02", action_id: "candidate:S02", identity_basis: "catalog action",
    title: "교환 장소", program_status: "확인 필요", program: { benefit: "원문 혜택" },
    overview_sources: [], conditions: [], eligibility_status: "not_evaluated",
    places: [{
      place_id: "S02:new", title: "새 장소", address: "서울 중구 세종대로 1", district: "중구",
      service_key: "exchange", schedule: "목요일 15:00-19:00", status: "unknown",
      announced_start: "2026-03-19", announced_end_exclusive: null,
      source: { id: "S02-S01", url: "https://example.test/source", title: "공식 출처" },
    }],
  },
};

test("browser detail contract keeps place/service/source/schedule identity and zero places is valid", () => {
  assert.equal(isMissionItemDetail(detail), true);
  assert.equal(isMissionItemDetail({ ...detail, detail: { ...detail.detail, places: [] } }), true);
  assert.equal(isMissionItemDetail({ ...detail, detail: { ...detail.detail,
    places: [{ ...detail.detail.places[0], service_key: "" }] } }), false);
  assert.equal(displayValue({ weekday: "Thursday", hours: "15:00-19:00" }),
    "weekday: Thursday · hours: 15:00-19:00");
});

test("return and Kakao links retain exact IDs and use address search without coordinates or route claims", () => {
  assert.equal(missionReturnHref(batchId, itemId), `/missions?batchId=${batchId}&itemId=${itemId}`);
  assert.equal(kakaoAddressSearchHref(" 서울 중구 세종대로 1 "),
    "https://map.kakao.com/link/search/%EC%84%9C%EC%9A%B8%20%EC%A4%91%EA%B5%AC%20%EC%84%B8%EC%A2%85%EB%8C%80%EB%A1%9C%201");
  assert.equal(kakaoAddressSearchHref(" "), null);
});

test("detail_view and map_open retries can reuse exact stable keys and occurrence times", () => {
  const now = () => new Date("2026-09-17T01:02:03.123Z");
  const id = () => "00000000-0000-4000-8000-000000000004";
  const event = createViewEvent(batchId, itemId, "detail_view", id, now);
  assert.deepEqual(event, {
    clientEventId: id(), batchId, itemId, eventType: "detail_view", occurredAt: now().toISOString(),
  });
  assert.equal(createViewEvent(batchId, itemId, "map_open", id, now).eventType, "map_open");
});

test("detail client distinguishes an empty-place success from an upstream failure", async () => {
  const empty = { ...detail, detail: { ...detail.detail, places: [] } };
  const client = createMissionDetailClient(async () => Response.json({
    data: empty, error: null, requestId: "detail-1",
  }));
  assert.deepEqual((await client(batchId, itemId)).detail.places, []);

  const failed = createMissionDetailClient(async () => Response.json({
    data: null, error: { code: "DATABASE_UNAVAILABLE", message: "잠시 후 다시 시도" }, requestId: "detail-2",
  }, { status: 503 }));
  await assert.rejects(() => failed(batchId, itemId), (caught: unknown) =>
    caught instanceof MissionDetailClientError && caught.status === 503 && caught.code === "DATABASE_UNAVAILABLE");
});

test("imported candidate source names are accepted without inventing URLs, but other missing sources fail", () => {
  const place = { ...detail.detail.places[0], relation_type: "candidate_action",
    source: { id: "legacy", url: "", title: "스마트서울맵", origin: "legacy_place_catalog" } };
  const withPlace = (p: unknown) => ({ ...detail, detail: { ...detail.detail, places: [p] } });
  assert.equal(isMissionItemDetail(withPlace(place)), true);
  assert.equal(isMissionItemDetail(withPlace({ ...place, relation_type: "registered" })), false);
  assert.equal(isMissionItemDetail(withPlace({ ...place, source: { ...place.source, origin: "unknown" } })), false);
  assert.equal(isMissionItemDetail(withPlace({ ...place, source: { ...place.source, url: "javascript:alert(1)" } })), false);
});
