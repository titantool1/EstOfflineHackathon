import test from "node:test";
import assert from "node:assert/strict";
import { createKakaoLocal, KakaoLocalError } from "../src/lib/server/kakao-local.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const h = { region_type: "H", code: "1230059000", region_1depth_name: "전남광주통합특별시", region_2depth_name: "북구", region_3depth_name: "용봉동" };
const b = { ...h, region_type: "B", code: "2917010700", region_3depth_name: "용봉동" };

test("address search emits only usable administrative neighborhoods and de-duplicates codes", async () => {
  const api = createKakaoLocal({ apiKey: "server-secret", fetch: async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://dapi.kakao.com/v2/local/search/address.json");
    assert.equal(url.searchParams.get("query"), "광주 북구 용봉동"); assert.equal(url.searchParams.get("size"), "30");
    assert.equal(new Headers(init?.headers).get("Authorization"), "KakaoAK server-secret");
    return json({ meta: { is_end: false }, documents: [
      { address: { h_code: h.code, region_1depth_name: h.region_1depth_name, region_2depth_name: h.region_2depth_name, region_3depth_h_name: h.region_3depth_name } },
      { address: { h_code: h.code, region_1depth_name: h.region_1depth_name, region_2depth_name: h.region_2depth_name, region_3depth_h_name: h.region_3depth_name } },
    ] });
  } });
  assert.deepEqual(await api.search("광주 북구 용봉동"), { candidates: [{ regionCode: h.code, sido: h.region_1depth_name,
    sigungu: h.region_2depth_name, dong: h.region_3depth_name }], hasMore: true, emptyReason: null });
});

test("legal-dong-only address match is distinct from no address result", async () => {
  const legalOnly = createKakaoLocal({ apiKey: "key", fetch: async () => json({ meta: { is_end: true }, documents: [
    { address: { h_code: "", region_1depth_name: "서울특별시", region_2depth_name: "성동구", region_3depth_h_name: "" } },
  ] }) });
  assert.equal((await legalOnly.search("서울 성동구 성수동1가")).emptyReason, "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED");
  const empty = createKakaoLocal({ apiKey: "key", fetch: async () => json({ meta: { is_end: true }, documents: [] }) });
  assert.equal((await empty.search("없는동네")).emptyReason, "NO_RESULTS");
});

test("coordinate lookup ignores B and returns only H without coordinates or address", async () => {
  const api = createKakaoLocal({ apiKey: "key", fetch: async (input) => {
    const url = new URL(String(input)); assert.equal(url.pathname, "/v2/local/geo/coord2regioncode.json");
    assert.equal(url.searchParams.get("x"), "126.9"); assert.equal(url.searchParams.get("y"), "35.1");
    return json({ documents: [b, h] });
  } });
  const result = await api.coordinates(35.1, 126.9);
  assert.deepEqual(result.candidates, [{ regionCode: h.code, sido: h.region_1depth_name, sigungu: h.region_2depth_name, dong: h.region_3depth_name }]);
  assert.doesNotMatch(JSON.stringify(result), /latitude|longitude|address|2917010700/);
});

test("malformed, upstream failure, missing key and timeout remain distinct safe errors", async () => {
  await assert.rejects(createKakaoLocal({ apiKey: "key", fetch: async () => json({ documents: [] }) }).search("동네"),
    { code: "KAKAO_INVALID_RESPONSE" });
  await assert.rejects(createKakaoLocal({ apiKey: "key", fetch: async () => new Response("private", { status: 500 }) }).search("동네"),
    { code: "KAKAO_UNAVAILABLE" });
  await assert.rejects(createKakaoLocal({ apiKey: undefined, fetch: async () => assert.fail("request sent") }).search("동네"),
    { code: "KAKAO_NOT_CONFIGURED" });
  const timeout = createKakaoLocal({ apiKey: "key", timeoutMs: 20, fetch: async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("private timeout detail")), { once: true });
  }) });
  await assert.rejects(timeout.search("동네"), (error: unknown) => error instanceof KakaoLocalError
    && error.code === "KAKAO_TIMEOUT" && !error.message.includes("private"));
});
