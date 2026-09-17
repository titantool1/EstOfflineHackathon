import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { searchPlaces } from "../src/lib/server/map/places.ts";
import { findRoute } from "../src/lib/server/map/route.ts";
import { requestPlaces, requestRoute, targetFromSearch } from "../src/features/map/api.ts";
import { MapError, readPlaces, readRoute, safeSourceUrl } from "../src/features/map/contract.ts";

const place = { docId: "a", title: "초록 가게", summary: "용기 가져오기", category: "상점", address: "서울", sourceUrl: "https://example.test/info", latitude: 37, longitude: 127, distanceKm: 1 };
const places = { results: [place], meta: { resultCount: 1, tookMs: 2 } };
const route = { path: [{ latitude: 37, longitude: 127 }, { latitude: 38, longitude: 128 }], distanceMeters: 1234, durationSeconds: 180 };
const provider = { routes: [{ result_code: 0, summary: { distance: 1234, duration: 180 }, sections: [{ roads: [{ vertexes: [127, 37, 128, 38] }] }] }] };
const input = { origin: route.path[0], destination: route.path[1] };
const req = (body: unknown, contentType = "application/json") => new Request("http://web/api/map", { method: "POST", headers: { "Content-Type": contentType }, body: JSON.stringify(body) });
const code = (expected: string) => (error: unknown) => error instanceof MapError && error.code === expected && !error.message.includes("private-token");

test("null, arrays, wrong types and invalid coordinates are rejected before either upstream", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; throw new Error("must not call"); };
  for (const value of [null, [], "text", 1, { latitude: 91 }, { longitude: 181 }, { latitude: null }, { longitude: "127" }, { distanceKm: 0 }, { distanceKm: 101 }, { query: {} }, { region: 0 }, { query: "x".repeat(201) }]) {
    assert.equal((await searchPlaces(req(value), { fetch: fetcher })).status, 400);
  }
  for (const value of [null, [], {}, { origin: null, destination: {} }, { ...input, origin: [] }, { ...input, destination: { latitude: 91, longitude: 0 } }]) {
    assert.equal((await findRoute(req(value), { fetch: fetcher, apiKey: "fixture" })).status, 400);
  }
  assert.equal((await searchPlaces(req({}, "application/json-evil"), { fetch: fetcher })).status, 415);
  assert.equal((await findRoute(req(input, "text/plain"), { fetch: fetcher })).status, 415);
  assert.equal(calls, 0);
});

test("valid zero coordinates and defaults survive the team Spring contract", async () => {
  const response = await searchPlaces(req({ latitude: 0, longitude: 0 }), { fetch: async (url, init) => {
    assert.equal(new URL(String(url)).pathname, "/api/places"); assert.equal(init?.redirect, "error");
    assert.equal(init?.method, "GET");
    assert.deepEqual(Object.fromEntries(new URL(String(url)).searchParams), {
      query: "", region: "서울특별시", latitude: "0", longitude: "0", distanceKm: "30",
    });
    return Response.json({ data: places, error: null, requestId: "zero" });
  } });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), places);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const r = await findRoute(req({ origin: { latitude: 0, longitude: 0 }, destination: input.destination }), { apiKey: "fixture", fetch: async (url, init) => {
    assert.equal(new URL(String(url)).searchParams.get("origin"), "0,0");
    assert.equal(new Headers(init?.headers).get("Authorization"), "KakaoAK fixture");
    return Response.json(provider);
  } });
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), route);
});

test("URL coordinates distinguish missing/blank/out of range from zero; source links allow only safe HTTP(S)", () => {
  for (const search of ["?placeId=a&name=b", "?placeId=a&name=b&lat=&lng=0", "?placeId=a&name=b&lat=91&lng=0", "?placeId=a&name=b&lat=0&lng=181", "?placeId=a&name=b&lat=NaN&lng=0"]) assert.equal(targetFromSearch(search), null);
  assert.equal(targetFromSearch("?placeId=a&name=b&lat=0&lng=0")?.latitude, 0);
  for (const value of [null, "javascript:alert(1)", "data:text/html,a", "//example.test", "/relative", "https://user:pass@example.test", "https://example.test\\@evil.test", "https://example.test\n"]) assert.equal(safeSourceUrl(value), null);
  assert.equal(safeSourceUrl("http://example.test/a"), "http://example.test/a");
  assert.equal(safeSourceUrl("https://example.test/a?q=1"), "https://example.test/a?q=1");
});

test("place results validate every rendered field and coordinate; no results remains success", () => {
  assert.deepEqual(readPlaces({ results: [], meta: { resultCount: 0, tookMs: 0 } }).results, []);
  for (const value of [null, [], {}, { ...places, meta: null }, { ...places, results: [null] },
    { ...places, results: [{ ...place, title: {} }] }, { ...places, results: [{ ...place, category: {} }] },
    { ...places, results: [{ ...place, latitude: 91 }] }, { ...places, results: [{ ...place, distanceKm: -1 }] }]) assert.throws(() => readPlaces(value), code("INVALID_RESPONSE"));
  assert.equal(readPlaces({ ...places, results: [{ ...place, sourceUrl: "javascript:private-token" }] }).results[0].sourceUrl, null);
});

test("browser clients reject malformed JSON/HTML/shape and hide raw server messages", async () => {
  for (const response of [() => new Response("private-token", { headers: { "Content-Type": "text/html" } }),
    () => new Response("{private-token", { headers: { "Content-Type": "application/json" } }), () => Response.json(null)]) {
    await assert.rejects(requestPlaces("", { fetch: async () => response() }), code("INVALID_RESPONSE"));
    await assert.rejects(requestRoute(input.origin, input.destination, { fetch: async () => response() }), code("INVALID_RESPONSE"));
  }
  await assert.rejects(requestPlaces("", { fetch: async () => Response.json({ error: "private-token" }, { status: 503 }) }), code("UNAVAILABLE"));
  await assert.rejects(requestPlaces("", { fetch: async () => new Response("", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="eco-app-qa"' } }) }), code("QA_AUTH_REQUIRED"));
  const result = await requestPlaces("", { fetch: async () => Response.json({ ...places, results: [{ ...place, latitude: null, longitude: null }] }) });
  assert.equal(result.places.length, 0);
});

test("place proxy rejects invalid responses and never leaks provider bodies", async () => {
  for (const response of [() => Response.json(null), () => Response.json({ data: { ...places, results: [{ ...place, longitude: 181 }] }, error: null, requestId: "invalid" }),
    () => new Response("private-token", { headers: { "Content-Type": "text/html" } }), () => new Response("{private-token", { headers: { "Content-Type": "application/json" } })]) {
    const result = await searchPlaces(req({}), { fetch: async () => response() });
    assert.equal(result.status, 502); assert.ok(!(await result.text()).includes("private-token"));
  }
  const result = await searchPlaces(req({}), { fetch: async () => Response.json({ error: "private-token" }, { status: 500 }) });
  assert.equal(result.status, 503); assert.ok(!(await result.text()).includes("private-token"));
});

test("route provider malformed structures/coordinates are not accepted; provider errors are safe", async () => {
  for (const value of [null, {}, { routes: [null] }, { routes: [{ result_code: 0 }] },
    { routes: [{ ...provider.routes[0], summary: { distance: -1, duration: 0 } }] },
    { routes: [{ ...provider.routes[0], sections: [{ roads: [{ vertexes: [127, 37, 128] }] }] }] },
    { routes: [{ ...provider.routes[0], sections: [{ roads: [{ vertexes: [127, 37, 128, 91] }] }] }] }]) {
    const result = await findRoute(req(input), { apiKey: "fixture", fetch: async () => Response.json(value) }); assert.equal(result.status, 502);
  }
  const missing = await findRoute(req(input), { apiKey: "" }); assert.equal(missing.status, 503);
  const noRoute = await findRoute(req(input), { apiKey: "fixture", fetch: async () => Response.json({ routes: [{ result_code: 104, result_msg: "private-token" }] }) });
  assert.equal(noRoute.status, 404); assert.ok(!(await noRoute.text()).includes("private-token"));
  const denied = await findRoute(req(input), { apiKey: "fixture", fetch: async () => new Response("private-token", { status: 401 }) });
  assert.equal(denied.status, 502); assert.ok(!(await denied.text()).includes("private-token"));
  assert.throws(() => readRoute({ ...route, path: [null, {}] }), code("INVALID_RESPONSE"));
});

test("long valid route sampling retains first/last point and caps at 2000", async () => {
  const vertexes = Array.from({ length: 2100 }, (_, i) => [127 + i / 100000, 37]).flat();
  const result = await findRoute(req(input), { apiKey: "fixture", fetch: async () => Response.json({ routes: [{ ...provider.routes[0], sections: [{ roads: [{ vertexes }] }] }] }) });
  const body = await result.json(); assert.equal(body.path.length, 2000);
  assert.deepEqual(body.path[0], { longitude: vertexes[0], latitude: 37 });
  assert.deepEqual(body.path.at(-1), { longitude: vertexes.at(-2), latitude: 37 });
});

test("real HTTP incomplete bodies time out in both server adapters and browser clients", async t => {
  const server = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.flushHeaders(); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const fetcher: typeof fetch = (_url, init) => fetch(base, init);
  assert.equal((await searchPlaces(req({}), { baseUrl: base, timeoutMs: 50 })).status, 504);
  assert.equal((await findRoute(req(input), { fetch: fetcher, apiKey: "fixture", timeoutMs: 50 })).status, 504);
  await assert.rejects(requestPlaces("", { fetch: fetcher, timeoutMs: 50 }), code("TIMEOUT"));
  await assert.rejects(requestRoute(input.origin, input.destination, { fetch: fetcher, timeoutMs: 50 }), code("TIMEOUT"));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestPlaces("", { fetch: fetcher, signal: controller.signal }), code("CANCELLED"));
});


test("place search uses the team Spring GET contract and unwraps its envelope", async () => {
  let called = false;
  const response = await searchPlaces(req({ query: "성동구 개인컵", distanceKm: 5 }), {
    baseUrl: "http://team-backend:8080", fetch: async (input, init) => {
      called = true;
      const url = new URL(String(input));
      assert.equal(url.origin, "http://team-backend:8080");
      assert.equal(url.pathname, "/api/places");
      assert.equal(url.searchParams.get("query"), "성동구 개인컵");
      assert.equal(url.searchParams.get("distanceKm"), "5");
      assert.equal(init?.method, "GET");
      assert.equal(init?.body, undefined);
      return Response.json({ data: places, error: null, requestId: "place-check" });
    },
  });
  assert.ok(called);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), places);
  const empty = await searchPlaces(req({}), { fetch: async () => Response.json({
    data: { results: [], meta: { resultCount: 0, tookMs: 0 } }, error: null, requestId: "empty",
  }) });
  assert.equal(empty.status, 200);
  assert.equal((await empty.json()).results.length, 0);
});
