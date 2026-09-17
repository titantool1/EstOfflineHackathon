import test from "node:test";
import assert from "node:assert/strict";
import { createPlaceTools } from "../src/lib/server/ai/tools/place-tools.ts";
import { createSpringClient } from "../src/lib/server/spring-client.ts";
import { createConversationRunner } from "../src/lib/server/ai/application/conversation-session.ts";
import { createCatalogTools } from "../src/lib/server/ai/tools/catalog-tools.ts";
import { createUserConditionLoader } from "../src/lib/server/ai/adapters/user-condition-context.ts";
import { createConversationTools } from "../src/lib/server/ai/tools/conversation-tools.ts";
import { createConditionMemory } from "../src/lib/server/ai/application/condition-memory.ts";
import type { ConversationProvider } from "../src/lib/server/ai/conversation-contracts.ts";

const args = { query: "다회용기", location: "seoul", district: "" };
const turn = { authenticatedUserId: "user-a", turnId: "turn-a", text: "우리 동네 다회용기 매장", sessionHeaders: { Cookie: "ECOTEAMSESSION=synthetic", Authorization: "not-forwarded" } };
const place = (n: number) => ({ docId: String(n), title: `카페${n}`, summary: "후보", address: `서울특별시 성동구 주소${n}`, category: "개인컵", sourceUrl: "https://example.com/source", latitude: 37.5, longitude: 127, distanceKm: 1 });
const data = (count = 1) => ({ results: Array.from({ length: count }, (_, n) => place(n)), meta: { resultCount: count, tookMs: 1 } });
function setup(options: { neighborhood?: unknown; places?: unknown; status?: number; unavailable?: boolean } = {}) {
  const requests: { url: URL; headers: Headers }[] = [];
  const clientConfig = { baseUrl: "http://spring.test", fetch: (async (input, init) => {
    const url = new URL(String(input)), headers = new Headers(init?.headers); requests.push({ url, headers });
    if (options.unavailable) throw new TypeError("offline");
    const status = options.status ?? 200;
    const value = url.pathname === "/api/profile/neighborhood"
      ? { neighborhood: options.neighborhood === undefined ? { regionCode: "1120059000", sido: "서울특별시", sigungu: "성동구", dong: "성수1가1동" } : options.neighborhood }
      : options.places ?? data();
    return Response.json({ data: status === 200 ? value : null, error: status === 200 ? null : { code: "SERVICE_ERROR", message: "failed" }, requestId: headers.get("X-Request-Id") }, { status, headers: { "X-Request-Id": headers.get("X-Request-Id")! } });
  }) as typeof fetch };
  const client = createSpringClient(clientConfig);
  return { tools: createPlaceTools(client), requests, catalog: createCatalogTools(client), load: createUserConditionLoader(clientConfig) };
}

test("explicit district search uses map API without embedding, cookies or neighborhood lookup; truncates safely", async () => {
  const api = setup({ places: data(40) });
  const result = await api.tools.execute("search_places", { ...args, query: "텀블러", district: "성동구" }, { sessionHeaders: turn.sessionHeaders });
  assert.equal(api.requests.length, 1); const req = api.requests[0];
  assert.equal(req.url.pathname, "/api/places"); assert.equal(req.url.searchParams.get("district"), "성동구");
  assert.equal(req.headers.has("Cookie"), false); assert.equal(req.headers.has("Authorization"), false);
  assert.equal(result.status, "ok"); assert.equal(result.results?.length, 8);
  assert.equal(result.truncated, true); assert.equal(result.retrieved_count, 40); assert.equal(result.total_count_known, false);
  assert.equal(result.benefit_status, "unverified"); assert.equal(result.scope?.user_location_known, false);
  assert.equal("distanceKm" in result.results![0], false);
});

test("our neighborhood uses current session cookie, selected district only, no model user ID", async () => {
  const api = setup();
  const result = await api.tools.execute("search_places", { ...args, location: "saved_neighborhood" }, { sessionHeaders: turn.sessionHeaders });
  assert.deepEqual(api.requests.map(r => r.url.pathname), ["/api/profile/neighborhood", "/api/places"]);
  assert.equal(api.requests[0].headers.get("Cookie"), "ECOTEAMSESSION=synthetic");
  assert.equal(api.requests[0].headers.has("Authorization"), false);
  assert.equal(api.requests[1].headers.has("Cookie"), false);
  assert.equal(api.requests[1].url.searchParams.get("district"), "성동구");
  assert.equal(api.requests.some(r => r.url.searchParams.has("userId")), false);
  assert.equal(result.scope?.source, "saved_neighborhood"); assert.equal(JSON.stringify(result).includes("1120059000"), false);
});

test("missing and unsupported saved neighborhoods never silently search Seoul", async () => {
  for (const [neighborhood, status] of [[null, "needs_location"], [{ regionCode: "2917059000", sido: "광주광역시", sigungu: "북구", dong: "용봉동" }, "unsupported_region"]] as const) {
    const api = setup({ neighborhood });
    const result = await api.tools.execute("search_places", { ...args, location: "saved_neighborhood" }, { sessionHeaders: turn.sessionHeaders });
    assert.equal(result.status, status); assert.equal(api.requests.length, 1);
  }
});

test("food container zero results preserves query and does not substitute cup shops", async () => {
  const api = setup({ places: data(0) }); const result = await api.tools.execute("search_places", args);
  assert.equal(result.status, "no_results"); assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].url.searchParams.get("query"), "다회용기");
  assert.equal(result.search_area, "서울시청 중심 30km 범위(서울 전체 조회 아님)");
  assert.equal(result.scope?.coverage, "seoul_city_hall_30km"); assert.deepEqual(result.results, []);
});

test("bad model arguments, extra identities/URLs and inconsistent location are rejected before network", async () => {
  const api = setup();
  for (const input of [{ ...args, userId: "other" }, { ...args, query: " " }, { ...args, query: "a".repeat(201) },
    { ...args, district: "북구" }, { ...args, location: "saved_neighborhood", district: "성동구" },
    { ...args, location: ["seoul"] }, { ...args, url: "http://other.test/api/places" }]) {
    await assert.rejects(api.tools.execute("search_places", input), /INVALID_TOOL_ARGUMENTS/);
  }
  assert.equal(api.requests.length, 0);
});

test("session absent/expired, service failure and invalid responses are errors, never zero results", async () => {
  const api = setup();
  await assert.rejects(api.tools.execute("search_places", { ...args, location: "saved_neighborhood" }), { status: 401 });
  assert.equal(api.requests.length, 0);
  for (const status of [401, 403, 429, 503]) {
    const expired = setup({ status });
    await assert.rejects(expired.tools.execute("search_places", { ...args, location: "saved_neighborhood" }, { sessionHeaders: turn.sessionHeaders }), { status });
    assert.equal(expired.requests.length, 1);
  }
  await assert.rejects(setup({ places: {} }).tools.execute("search_places", args), /BACKEND_INVALID_RESPONSE/);
  await assert.rejects(setup({ unavailable: true }).tools.execute("search_places", args), /BACKEND_UNAVAILABLE/);
});

test("cancellation stops before network, malformed source URL is removed", async () => {
  const api = setup({ places: { ...data(), results: [{ ...place(0), sourceUrl: "javascript:alert(1)" }] } });
  await assert.rejects(api.tools.execute("search_places", args, { signal: AbortSignal.abort() }));
  assert.equal(api.requests.length, 0);
  const result = await api.tools.execute("search_places", args); assert.equal(result.results?.[0].sourceUrl, null);
});

test("tool available without catalog prerequisite, per-turn cap and memory owner preserved", async () => {
  const api = setup(); const options = { ...api, places: api.tools, turn, memory: createConditionMemory("user-a", []) };
  const tools = createConversationTools(options);
  assert.ok(tools.definitions.some(t => t.name === "search_places"));
  await tools.execute("search_places", args, AbortSignal.timeout(1000));
  await tools.execute("search_places", args, AbortSignal.timeout(1000));
  await assert.rejects(tools.execute("search_places", args, AbortSignal.timeout(1000)), /PLACE_SEARCH_LIMIT/);
  assert.equal(api.requests.length, 2);
  assert.throws(() => createConversationTools({ ...options, memory: createConditionMemory("other", []) }), /OWNER_MISMATCH/);
});

test("runner executes place tool directly and marks searching; service failure removes all tools", async () => {
  for (const unavailable of [false, true]) {
    const api = setup({ unavailable }); let calls = 0;
    const events: unknown[] = [];
    const provider: ConversationProvider = {
      create: async () => ({ id: "synthetic", responseIds: [] }), close: async () => {},
      respond: async (_handle, input, definitions, instructions) => {
        if (++calls === 1) {
          assert.ok(definitions.some(t => t.name === "search_places"));
          assert.equal(instructions.includes("현재 실행에는 장소 검색 도구가 없다"), false);
          return { text: null, calls: [{ callId: "place-1", name: "search_places", arguments: JSON.stringify(args) }] };
        }
        if (unavailable) { assert.equal(definitions.length, 0); assert.match(instructions, /조회.*중단/); }
        else { assert.match(JSON.stringify(input), /카페0/); assert.match(JSON.stringify(input), /unverified/); }
        return { text: unavailable ? "조회하지 못했어요." : "등록된 매장 후보입니다.", calls: [] };
      },
    };
    const runner = createConversationRunner({ ...api, places: api.tools, provider }), session = runner.createSession("user-a");
    const result = await runner.runTurn(session, turn, { commit: async () => {}, onEvent: e => events.push(e) });
    assert.equal(result.toolCalls, 1); assert.equal(api.requests.length, 1);
    assert.ok(events.some(e => JSON.stringify(e) === JSON.stringify({ type: "progress", stage: "searching" })));
    await runner.closeSession(session);
  }
});


test("saved Kakao short Seoul name and official name both use the district", async () => {
  for (const sido of ["서울", "서울특별시"]) {
    const api = setup({ neighborhood: { regionCode: "1120059000", sido, sigungu: "성동구", dong: "성수1가1동" } });
    const result = await api.tools.execute("search_places", { ...args, location: "saved_neighborhood" }, { sessionHeaders: turn.sessionHeaders });
    assert.equal(result.status, "ok", sido);
    assert.equal(api.requests[1].url.searchParams.get("district"), "성동구");
  }
});
