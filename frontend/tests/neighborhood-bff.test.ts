import test from "node:test";
import assert from "node:assert/strict";
import { createNeighborhoodHandlers } from "../src/lib/server/neighborhood-bff.ts";
import type { NeighborhoodSpring } from "../src/lib/server/profile-neighborhood.ts";

const neighborhood = { regionCode: "1230059000", sido: "전남광주통합특별시", sigungu: "북구", dong: "용봉동" };
const ok = (requestId: string) => ({ status: 200, body: { data: { neighborhood: null }, error: null, requestId } });
const unauthorized = (requestId: string) => ({ status: 401, body: { data: null, error: { code: "AUTHENTICATION_REQUIRED", message: "로그인이 필요합니다." }, requestId } });
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://eco.test/api/profile/neighborhood/resolve", {
  method: "POST", headers: { Origin: "https://eco.test", "Content-Type": "application/json", "X-Request-Id": "resolve-1", ...headers },
  body: JSON.stringify(body),
});

test("resolve authenticates with only the session cookie before Kakao", async () => {
  let kakaoCalls = 0; let cookie: string | null = null;
  const spring: NeighborhoodSpring = {
    async get(requestId, value) { cookie = value; return unauthorized(requestId!); },
    async save() { throw new Error("unexpected save"); },
  };
  const kakao = { async search() { kakaoCalls++; return { candidates: [neighborhood], hasMore: false, emptyReason: null }; },
    async coordinates() { kakaoCalls++; return { candidates: [neighborhood], hasMore: false, emptyReason: null }; } };
  const reply = await createNeighborhoodHandlers({ spring, kakao }).resolve(request({ query: "용봉동" }, { Cookie: "ECOTEAMSESSION=owner" }));
  assert.equal(reply.status, 401); assert.equal(kakaoCalls, 0); assert.equal(cookie, "ECOTEAMSESSION=owner");
});

test("same-origin and exact valid input are required before external lookup", async () => {
  let kakaoCalls = 0;
  const spring: NeighborhoodSpring = { async get(requestId) { return ok(requestId!); }, async save() { throw new Error("unexpected"); } };
  const kakao = { async search() { kakaoCalls++; return { candidates: [], hasMore: false, emptyReason: "NO_RESULTS" as const }; },
    async coordinates() { kakaoCalls++; return { candidates: [], hasMore: false, emptyReason: "NO_RESULTS" as const }; } };
  const handlers = createNeighborhoodHandlers({ spring, kakao });
  const crossOrigin = request({ query: "용봉동" }, { Origin: "https://evil.test" });
  assert.equal((await handlers.resolve(crossOrigin)).status, 403);
  for (const body of [{ query: " " }, { query: "가".repeat(101) }, { query: "용봉동", userId: "other" },
    { latitude: 91, longitude: 0 }, { latitude: 35, longitude: 126, query: "용봉동" }]) {
    assert.equal((await handlers.resolve(request(body))).status, 400);
  }
  assert.equal(kakaoCalls, 0);
});

test("same-origin uses the validated public Host when the Next request URL is internal", async () => {
  let calls = 0;
  const spring: NeighborhoodSpring = { async get(requestId) { return ok(requestId!); }, async save() { throw new Error("unexpected"); } };
  const kakao = { async search() { calls++; return { candidates: [neighborhood], hasMore: false, emptyReason: null }; },
    async coordinates() { throw new Error("unexpected"); } };
  const proxied = new Request("http://frontend:3000/api/profile/neighborhood/resolve", { method: "POST", headers: {
    Host: "127.0.0.1:3337", Origin: "http://127.0.0.1:3337", "Content-Type": "application/json",
  }, body: JSON.stringify({ query: "용봉동" }) });
  assert.equal((await createNeighborhoodHandlers({ spring, kakao }).resolve(proxied)).status, 200);
  assert.equal(calls, 1);
});

test("valid search trims input and returns candidates without query or coordinates", async () => {
  let seen = "";
  const spring: NeighborhoodSpring = { async get(requestId) { return ok(requestId!); }, async save() { throw new Error("unexpected"); } };
  const kakao = { async search(query: string) { seen = query; return { candidates: [neighborhood], hasMore: false, emptyReason: null }; },
    async coordinates() { throw new Error("unexpected"); } };
  const reply = await createNeighborhoodHandlers({ spring, kakao }).resolve(request({ query: "  용봉동  " }));
  const body = await reply.json(); assert.equal(reply.status, 200); assert.equal(seen, "용봉동");
  assert.deepEqual(body.data.candidates, [neighborhood]); assert.doesNotMatch(JSON.stringify(body), /latitude|longitude|query/);
});

test("PUT forwards only cookie and CSRF with no caller-selected owner", async () => {
  let observed: unknown[] = [];
  const spring: NeighborhoodSpring = {
    async get(requestId) { return ok(requestId!); },
    async save(value, requestId, cookie, csrf) { observed = [value, cookie, csrf]; return { status: 200,
      body: { data: { neighborhood }, error: null, requestId: requestId! } }; },
  };
  const handlers = createNeighborhoodHandlers({ spring, kakao: { async search() { throw new Error(); }, async coordinates() { throw new Error(); } } });
  const put = new Request("https://eco.test/api/profile/neighborhood", { method: "PUT", headers: {
    Origin: "https://eco.test", Cookie: "ECOTEAMSESSION=owner", "X-CSRF-TOKEN": "csrf", "Content-Type": "application/json",
  }, body: JSON.stringify({ ...neighborhood, userId: "other" }) });
  assert.equal((await handlers.put(put)).status, 400); assert.deepEqual(observed, []);
  const valid = new Request("https://eco.test/api/profile/neighborhood", { method: "PUT", headers: {
    Origin: "https://eco.test", Cookie: "ECOTEAMSESSION=owner", "X-CSRF-TOKEN": "csrf", "Content-Type": "application/json",
  }, body: JSON.stringify(neighborhood) });
  assert.equal((await handlers.put(valid)).status, 200);
  assert.deepEqual(observed, [neighborhood, "ECOTEAMSESSION=owner", "csrf"]);
});
