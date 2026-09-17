import { test } from "node:test";
import assert from "node:assert/strict";
import { RequestBudget } from "../src/lib/server/map/request-budget.ts";
import { searchPlaces } from "../src/lib/server/map/places.ts";
import { findRoute } from "../src/lib/server/map/route.ts";
import { createSessionProxy } from "../src/lib/server/session-proxy.ts";
import { createAccountClient, AccountError } from "../src/features/profile/account-client.ts";
import { requestPlaces } from "../src/features/map/api.ts";
import { MapError } from "../src/features/map/contract.ts";
const req = (body: unknown) => new Request("http://web/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const input = { origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } };
const empty = { results: [], meta: { resultCount: 0, tookMs: 0 } };

test("window/concurrency budgets recover; release is idempotent and rollover keeps active calls", () => {
  let now = 1000;
  const budget = new RequestBudget(2, 1, 60_000, () => now);
  const a = budget.acquire(); assert.ok("release" in a);
  assert.deepEqual(budget.acquire(), { retryAfter: 1 });
  now += 60_000; assert.deepEqual(budget.acquire(), { retryAfter: 1 });
  a.release(); a.release();
  const b = budget.acquire(); assert.ok("release" in b); b.release();
  const c = budget.acquire(); assert.ok("release" in c); c.release();
  assert.deepEqual(budget.acquire(), { retryAfter: 60 });
  now += 60_000; assert.ok("release" in budget.acquire());
  assert.throws(() => new RequestBudget(0, 1));
});

test("invalid inputs do not spend budget; 429 stops upstream and carries safe headers", async () => {
  let now = 1000, calls = 0;
  const budget = new RequestBudget(1, 1, 60_000, () => now);
  const options = { budget, fetch: async () => { calls++; return Response.json({ data: empty, error: null, requestId: "limit-check" }); } };
  assert.equal((await searchPlaces(req(null), options)).status, 400);
  assert.equal((await searchPlaces(req({}), options)).status, 200);
  const request = req({}); request.headers.set("X-Request-Id", "limit-test");
  request.headers.set("X-Forwarded-For", "spoofed-ip");request.headers.set("Cookie", "eco_qa=not-identity");
  const limited = await searchPlaces(request, options);
  assert.equal(limited.status, 429);assert.equal(limited.headers.get("Retry-After"), "60");
  assert.equal(limited.headers.get("X-Request-Id"), "limit-test");assert.equal((await limited.json()).code, "RATE_LIMITED");
  assert.equal(calls, 1);now += 60_000;
  assert.equal((await searchPlaces(req({}), options)).status, 200); assert.equal(calls, 2);
});

test("concurrent upstream calls are capped and failure releases the slot", async () => {
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  const options = { budget: new RequestBudget(20, 1), apiKey: "fixture", fetch: async () => { calls++; started();await pending;throw new Error("private-token"); } };
  const first = findRoute(req(input), options); await ready;
  assert.equal((await findRoute(req(input), options)).status, 429);assert.equal(calls, 1);
  release();assert.equal((await first).status, 503);
  assert.equal((await findRoute(req(input), options)).status, 503); assert.equal(calls, 2);
});

test("unfinished incoming bodies are cancelled and time out before any upstream", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++;throw new Error("must not call"); };
  for (const handler of [
    (r: Request) => createSessionProxy({ baseUrl: "http://spring:8080", timeoutMs: 25, fetch: fetcher })(r, "/api/signup"),
    (r: Request) => searchPlaces(r, { timeoutMs: 25, fetch: fetcher }),
    (r: Request) => findRoute(r, { timeoutMs: 25, fetch: fetcher, apiKey: "fixture" }),
  ]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const request = new Request("http://web/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    const keepAlive = setTimeout(() => {}, 500);
    try { const result = await handler(request);assert.equal(result.status, 504);assert.equal(cancelled, true); }
    finally { clearTimeout(keepAlive); }
  }
  assert.equal(calls, 0);
});

test("oversize incoming bodies are rejected before upstream, including chunked bodies", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++;throw new Error("must not call"); };
  for (const handler of [
    (r: Request) => createSessionProxy({ baseUrl: "http://spring:8080", fetch: fetcher })(r, "/api/signup"),
    (r: Request) => searchPlaces(r, { fetch: fetcher }),
    (r: Request) => findRoute(r, { fetch: fetcher, apiKey: "fixture" }),
  ]) assert.equal((await handler(req({ data: "x".repeat(16_384) }))).status, 413);
  assert.equal(calls, 0);
});

test("member BFF relays only numeric Retry-After; clients show safe 429 without POST retry", async () => {
  for (const retry of ["60", "private-token"]) {
    const proxy = createSessionProxy({ baseUrl: "http://spring:8080", fetch: async (_url, init) => {
      const id = new Headers(init?.headers).get("X-Request-Id");
      return Response.json({ data: null, error: { code: "RATE_LIMITED", message: "private-token" }, requestId: id },
        { status: 429, headers: { "X-Request-Id": id!, "Retry-After": retry } });
    } });
    const result = await proxy(req({}), "/api/signup");assert.equal(result.status, 429);
    assert.equal(result.headers.get("Retry-After"), retry === "60" ? "60" : null);
    assert.ok(!(await result.text()).includes("private-token"));
  }
  let calls = 0;
  const client = createAccountClient(async path => {
    calls++;
    return String(path).endsWith("csrf") ? Response.json({ data: { token: "fixture", headerName: "X-CSRF-TOKEN" }, error: null, requestId: "fixture" })
      : Response.json({ data: null, error: { code: "RATE_LIMITED", message: "private-token" }, requestId: "fixture" }, { status: 429 });
  });
  await assert.rejects(client.signup("a@example.test", "password123", ""), e => e instanceof AccountError && e.status === 429 && !e.outcomeUnknown && e.message.includes("요청이 많아요"));
  assert.equal(calls, 2);
  await assert.rejects(requestPlaces("", { fetch: async () => Response.json({ code: "RATE_LIMITED", error: "private-token" }, { status: 429 }) }),
    e => e instanceof MapError && e.code === "RATE_LIMITED" && e.message.includes("요청이 많아요"));
});
