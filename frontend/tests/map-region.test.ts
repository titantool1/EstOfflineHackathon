import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMapQuery } from "../src/lib/server/map/search-region.ts";
import { searchPlaces } from "../src/lib/server/map/places.ts";
import { MapError } from "../src/features/map/contract.ts";
const signal = () => new AbortController().signal;
const location = { text: "홍대", kind: "place" };
const deps = (keyword = "") => ({
  extract: async () => ({ location, keyword }),
  maps: async (path: string) => path === "search/keyword" ? [{ id: "hongdae", place_name: "홍익대학교 서울캠퍼스", address_name: "서울 마포구", category_name: "대학교", x: "126.925", y: "37.55" }]
    : [{ region_type: "B", region_1depth_name: "서울특별시", region_2depth_name: "마포구" }],
  selectPlace: async () => ({ status: "selected" as const, ids: ["hongdae"] }),
});
const req = (query: string, abortSignal?: AbortSignal) => new Request("http://web/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, interpretRegion: true }), signal: abortSignal });
const code = (value: string) => (e: unknown) => e instanceof MapError && e.code === value;

test("Hongdae and activity text reuse API-confirmed district without leaving Hongdae in DB terms", async () => {
  for (const keyword of ["", "텀블러"]) {
    assert.deepEqual(await resolveMapQuery(`홍대 ${keyword}`.trim(), signal(), deps(keyword)), {
      query: keyword, region: { sido: "서울특별시", sigungu: "마포구" },
    });
  }
});
test("administrative name is confirmed by address provider; activity alone never calls maps", async () => {
  const base = deps();
  assert.deepEqual(await resolveMapQuery("서울 성동구 리필", signal(), { ...base,
    extract: async () => ({ location: { text: "서울 성동구", kind: "admin" }, keyword: "리필" }),
    maps: async () => [{ address_type: "REGION", address: { region_1depth_name: "서울", region_2depth_name: "성동구" } }],
  }), { query: "리필", region: { sido: "서울특별시", sigungu: "성동구" } });
  assert.deepEqual(await resolveMapQuery("텀블러", signal(), { ...base, extract: async () => ({ location: null, keyword: "" }),
    maps: async () => { throw Error("must not geocode activity"); } }), { query: "텀블러", region: null });
});
test("ambiguous, absent, fabricated and failed geography cannot reach the DB", async () => {
  const base = deps();
  await assert.rejects(resolveMapQuery("중구", signal(), { ...base, extract: async () => ({ location: { text: "중구", kind: "admin" }, keyword: "" }) }), code("REGION_REQUIRED"));
  await assert.rejects(resolveMapQuery("홍대", signal(), { ...base, maps: async () => [] }), code("REGION_REQUIRED"));
  await assert.rejects(resolveMapQuery("홍대", signal(), { ...base, selectPlace: async () => ({ status: "selected", ids: ["invented"] }) }), code("REGION_REQUIRED"));
  await assert.rejects(resolveMapQuery("홍대", signal(), { ...base, maps: async () => { throw Error("private-token"); } }), code("REGION_UNAVAILABLE"));
  await assert.rejects(resolveMapQuery("홍대", signal(), { ...base, extract: async () => ({ location: { text: "마포구", kind: "admin" }, keyword: "" }) }), code("INVALID_RESPONSE"));
  for (const failure of ["REGION_REQUIRED", "REGION_UNAVAILABLE"]) {
    const response = await searchPlaces(req("홍대"), { resolveQuery: async () => { throw new MapError(failure); }, fetch: async () => { throw Error("must not query DB"); } });
    assert.equal(response.status, failure === "REGION_REQUIRED" ? 422 : 503);
    assert.equal((await response.json()).code, failure);
  }
});
test("BFF sends separate sido/district and activity to Spring, reset skips interpretation", async () => {
  for (const query of ["홍대 텀블러", ""]) {
    let interpreted = 0;
    const response = await searchPlaces(req(query), { resolveQuery: async () => { interpreted++; return { query: "텀블러", region: { sido: "서울특별시", sigungu: "마포구" } }; },
      fetch: async input => {
        const params = new URL(String(input)).searchParams;
        assert.equal(params.get("query"), query ? "텀블러" : "");
        assert.equal(params.get("district"), query ? "마포구" : null);
        assert.equal(params.get("region"), "서울특별시");
        return Response.json({ data: { results: [], meta: { resultCount: 0, tookMs: 0 } }, error: null, requestId: "test" });
      } });
    assert.equal(response.status, 200); assert.equal(interpreted, query ? 1 : 0);
    assert.deepEqual((await response.json()).meta.region, query ? { sido: "서울특별시", sigungu: "마포구" } : undefined);
  }
});
test("cancel after slow interpretation prevents a late DB request", async () => {
  const controller = new AbortController(); let dbCalls = 0;
  const response = await searchPlaces(req("홍대", controller.signal), {
    resolveQuery: async () => { controller.abort(); return { query: "", region: { sido: "서울특별시", sigungu: "마포구" } }; },
    fetch: async () => { dbCalls++; throw Error("unexpected"); },
  });
  assert.equal(response.status, 499); assert.equal(dbCalls, 0);
});

test("new header district constrains activity/empty searches; explicit region takes precedence", async () => {
  for (const q of ["", "텀블러", "홍대"]) {
    const request = new Request("http://web/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, interpretRegion: true, browseDistrict: "성동구" }) });
    const response = await searchPlaces(request, { resolveQuery: async () => ({ query: q === "홍대" ? "" : q, region: q === "홍대" ? { sido: "서울특별시", sigungu: "마포구" } : null }),
      fetch: async input => {
        const params = new URL(String(input)).searchParams;
        assert.equal(params.get("district"), q === "홍대" ? "마포구" : "성동구");
        assert.equal(params.get("region"), "서울특별시");
        return Response.json({ data: { results: [], meta: { resultCount: 0, tookMs: 0 } }, error: null, requestId: "header" });
      } });
    assert.equal(response.status, 200);
  }
});
test("invalid browse district is rejected before interpretation and DB", async () => {
  const response = await searchPlaces(new Request("http://web/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ browseDistrict: "not-a-district" }) }), { fetch: async () => { throw Error("must not call"); } });
  assert.equal(response.status, 400);
});
