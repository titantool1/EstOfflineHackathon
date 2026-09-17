import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { createSpringClient } from "../src/lib/server/spring-client.ts";

const isValue = (value: unknown): value is { value: number } => value !== null && typeof value === "object"
  && "value" in value && typeof value.value === "number";
const requestId = "client-contract-1";
const envelope = (data: unknown = { value: 1 }, error: unknown = null) => ({ data, error, requestId });
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "X-Request-Id": requestId } });
const client = (fetcher: typeof fetch) => createSpringClient({ baseUrl: "http://spring.invalid", fetch: fetcher });
const options = { validate: isValue, requestId };

async function serve(t: TestContext, handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  return `http://127.0.0.1:${address.port}`;
}

test("GET encodes values and carries a single request ID without caching or redirects", async () => {
  const result = await client(async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "http://spring.invalid");
    assert.equal(url.pathname, "/api/example");
    assert.equal(url.searchParams.get("q"), "서울 & / ?");
    assert.equal(url.searchParams.get("page"), "0");
    assert.equal(url.searchParams.get("active"), "false");
    assert.equal(url.searchParams.has("absent"), false);
    assert.equal(new Headers(init?.headers).get("X-Request-Id"), requestId);
    assert.equal(new Headers(init?.headers).get("X-Selected"), "test");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.body, undefined);
    return reply(envelope());
  }).request("/api/example", { ...options, query: { q: "서울 & / ?", page: 0, active: false, absent: undefined },
    headers: { "X-Selected": "test", "X-Request-Id": "must-not-override" } });
  assert.deepEqual(result, { status: 200, body: envelope() });
});

test("POST sends JSON and preserves a successful status", async () => {
  const result = await client(async (_input, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(String(init?.body)), { enabled: false, count: 0 });
    return reply(envelope(), 201);
  }).request("/api/example", { ...options, method: "POST", body: { enabled: false, count: 0 } });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body.data, { value: 1 });
});

test("Spring error status/code/message are preserved without retries or data validation", async () => {
  for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
    let calls = 0;
    const error = { code: status === 503 ? "DATABASE_UNAVAILABLE" : `HTTP_${status}`, message: "처리 실패" };
    const result = await client(async () => { calls++; return reply(envelope(null, error), status); })
      .request("/api/example", { requestId, validate: (value): value is never => assert.fail("error data validated: " + String(value)) });
    assert.deepEqual(result, { status, body: envelope(null, error) });
    assert.equal(calls, 1);
  }
});

test("empty collection and explicit nullable data follow the feature validator", async () => {
  const empty = await client(async () => reply(envelope([]))).request("/api/example", {
    requestId, validate: (data): data is unknown[] => Array.isArray(data),
  });
  assert.deepEqual(empty.body.data, []);
  assert.equal(empty.status, 200);
  const nullable = await client(async () => reply(envelope(null))).request("/api/example", {
    requestId, validate: (data): data is null => data === null,
  });
  assert.equal(nullable.status, 200);
  assert.equal(nullable.body.error, null);
});

test("invalid incoming request ID is replaced before transmission", async () => {
  let seen = "";
  const result = await client(async (_url, init) => {
    seen = new Headers(init?.headers).get("X-Request-Id")!;
    assert.match(seen, /^[a-f0-9-]{36}$/);
    return Response.json({ ...envelope(), requestId: seen }, { headers: { "X-Request-Id": seen } });
  }).request("/api/example", { validate: isValue, requestId: "bad id" });
  assert.equal(result.body.requestId, seen);
  assert.equal(result.status, 200);
});

test("mismatched or missing correlation and invalid JSON envelopes fail closed", async () => {
  const responses = [
    reply({ ...envelope(), requestId: "different" }),
    Response.json(envelope()),
    reply({ data: { value: 1 }, requestId }),
    reply(envelope({ value: "wrong type" })),
    reply(envelope(null)),
    reply(envelope({ value: 1 }, { code: "ERROR", message: "invalid success" })),
    reply(envelope({ value: 1 }, { code: "ERROR", message: "invalid error data" }), 400),
    reply(envelope(null, null), 500),
    reply(envelope(null, { code: "invalid-code", message: "invalid code" }), 400),
    reply(envelope(null, { code: "ERROR", message: "" }), 400),
    new Response("not json", { headers: { "Content-Type": "application/json", "X-Request-Id": requestId } }),
    new Response("<html>private error</html>", { status: 502, headers: { "X-Request-Id": requestId } }),
    new Response(null, { status: 204, headers: { "X-Request-Id": requestId } }),
  ];
  for (const response of responses) {
    const result = await client(async () => response).request("/api/example", options);
    assert.equal(result.status, 503);
    assert.equal(result.body.error?.code, "BACKEND_INVALID_RESPONSE");
    assert.equal(result.body.data, null);
    assert.doesNotMatch(JSON.stringify(result), /private error/);
  }
});

test("validator exceptions do not escape or disclose internal details", async () => {
  const result = await client(async () => reply(envelope())).request("/api/example", {
    requestId, validate: (value): value is never => { throw new Error("private schema error: " + String(value)); },
  });
  assert.equal(result.body.error?.code, "BACKEND_INVALID_RESPONSE");
  assert.doesNotMatch(JSON.stringify(result), /private schema/);
});

test("invalid destination, GET body, and unserializable body never issue a request", async () => {
  const never: typeof fetch = async () => assert.fail("invalid request sent");
  for (const path of ["https://other.invalid/api/example", "//other.invalid/api/example", "/api/../../private", "/api/\\other", "/api/example?q=1", "/api/example#fragment"]) {
    const result = await client(never).request(path, options);
    assert.equal(result.body.error?.code, "INVALID_BACKEND_REQUEST");
  }
  for (const request of [{ ...options, body: {} }, { ...options, method: "POST" as const, body: BigInt(1) }]) {
    assert.equal((await client(never).request("/api/example", request)).body.error?.code, "INVALID_BACKEND_REQUEST");
  }
  for (const config of [{ baseUrl: "file:///tmp" }, { baseUrl: "http://user:pass@spring.invalid" },
    { baseUrl: "http://spring.invalid/path" }, { baseUrl: "http://spring.invalid", timeoutMs: 0 },
    { baseUrl: "http://spring.invalid", timeoutMs: Number.MAX_SAFE_INTEGER }]) {
    const result = await createSpringClient({ ...config, fetch: never }).request("/api/example", options);
    assert.equal(result.body.error?.code, "BACKEND_CLIENT_CONFIG_ERROR");
  }
});

test("connection failure is sanitized and a write is never retried", async () => {
  let calls = 0;
  const result = await client(async () => { calls++; throw new Error("private host/password"); })
    .request("/api/example", { ...options, method: "PATCH", body: { value: 2 } });
  assert.equal(result.status, 503);
  assert.equal(result.body.error?.code, "BACKEND_UNAVAILABLE");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /private host/);
});

test("real HTTP timeout is distinct and the next request can recover", async t => {
  let received = 0;
  const baseUrl = await serve(t, (req, res) => {
    received++;
    if (req.url?.includes("ready=true")) {
      res.writeHead(200, { "Content-Type": "application/json", "X-Request-Id": requestId });
      res.end(JSON.stringify(envelope()));
    }
  });
  const live = createSpringClient({ baseUrl, timeoutMs: 500 });
  const timed = await live.request("/api/example", options);
  assert.equal(timed.status, 504);
  assert.equal(timed.body.error?.code, "BACKEND_TIMEOUT");
  const recovered = await live.request("/api/example", { ...options, query: { ready: true } });
  assert.equal(recovered.status, 200);
  assert.equal(received, 2);
});

test("timeout also covers reading the response body", async t => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json", "X-Request-Id": requestId });
    res.write("{");
  });
  const result = await createSpringClient({ baseUrl, timeoutMs: 500 }).request("/api/example", options);
  assert.equal(result.body.error?.code, "BACKEND_TIMEOUT");
});

test("caller cancellation before or during transport is distinct from timeout", async t => {
  const preCancelled = await client(async () => assert.fail("cancelled request sent"))
    .request("/api/example", { ...options, signal: AbortSignal.abort() });
  assert.equal(preCancelled.status, 499);
  const controller = new AbortController();
  const baseUrl = await serve(t, () => controller.abort());
  const result = await createSpringClient({ baseUrl }).request("/api/example", { ...options, signal: controller.signal });
  assert.equal(result.status, 499);
  assert.equal(result.body.error?.code, "REQUEST_CANCELLED");
});

test("real HTTP redirect is not followed", async t => {
  let calls = 0;
  const baseUrl = await serve(t, (_req, res) => {
    calls++;
    res.writeHead(302, { Location: "/api/other" });
    res.end();
  });
  const result = await createSpringClient({ baseUrl }).request("/api/example", options);
  assert.equal(result.body.error?.code, "BACKEND_UNAVAILABLE");
  assert.equal(calls, 1);
});
