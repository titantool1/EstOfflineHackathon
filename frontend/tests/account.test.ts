import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountClient, AccountError } from "../src/features/profile/account-client.ts";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createSessionProxy } from "../src/lib/server/session-proxy.ts";

const envelope = (data: unknown, status = 200, error: unknown = null, requestId = "test") => Response.json({ data, error, requestId }, { status, headers: { "X-Request-Id": requestId } });

test("signup forwards optional nickname and CSRF; random naming belongs to Spring", async () => {
  const calls: string[] = [];
  const client = createAccountClient(async (path, init) => {
    calls.push(String(path));
    if (String(path).endsWith("csrf")) return envelope({ token: "csrf-token", headerName: "X-CSRF-TOKEN" });
    assert.equal(new Headers(init?.headers).get("X-CSRF-TOKEN"), "csrf-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { email: "me@example.test", password: "password123", nickname: "" });
    return envelope({ userId: "user" }, 201);
  });
  await client.signup("me@example.test", "password123", "");
  assert.deepEqual(calls, ["/api/auth/csrf", "/api/signup"]);
});

test("server nickname is returned unchanged and business errors retain their status", async () => {
  const member = { userId: "user", email: "me@example.test", nickname: "에코쭙123456" };
  assert.deepEqual(await createAccountClient(async () => envelope(member)).me(), member);
  const client = createAccountClient(async path => String(path).endsWith("csrf")
    ? envelope({ token: "csrf-token", headerName: "X-CSRF-TOKEN" })
    : envelope(null, 409, { code: "EMAIL_IN_USE", message: "이미 가입된 이메일입니다." }));
  await assert.rejects(() => client.signup("me@example.test", "password123", "초록이"),
    (error: unknown) => error instanceof AccountError && error.status === 409 && error.message.includes("이미"));
});

test("login and logout each obtain a fresh CSRF token", async () => {
  let tokens = 0;
  const client = createAccountClient(async (path, init) => {
    if (String(path).endsWith("csrf")) return envelope({ token: `token-${++tokens}`, headerName: "X-CSRF-TOKEN" });
    assert.equal(new Headers(init?.headers).get("X-CSRF-TOKEN"), `token-${tokens}`);
    return envelope(String(path).endsWith("logout") ? { loggedOut: true } : { userId: "user" });
  });
  await client.login("me@example.test", "password123");
  await client.logout();
  assert.equal(tokens, 2);
});

test("session proxy preserves cookies, nickname payload and errors without forwarding owner headers", async () => {
  const proxy = createSessionProxy({ baseUrl: "http://spring:8080", fetch: async (url, init) => {
    assert.equal(String(url), "http://spring:8080/api/signup");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Cookie"), "ECOTEAMSESSION=synthetic");
    assert.equal(headers.get("X-CSRF-TOKEN"), "synthetic");
    assert.equal(headers.get("X-User-Id"), null);
    assert.equal(headers.get("X-Request-Id"), "request-test");
    assert.equal(JSON.parse(String(init?.body)).nickname, "초록이");
    const response = envelope(null, 409, { code: "EMAIL_IN_USE", message: "중복" }, "request-test");
    response.headers.append("Set-Cookie", "ECOTEAMSESSION=new; Path=/; HttpOnly; SameSite=Lax");
    return response;
  } });
  const result = await proxy(new Request("http://web/api/signup", { method: "POST", headers: {
    Cookie: "ECOTEAMSESSION=synthetic", "X-CSRF-TOKEN": "synthetic", "X-User-Id": "spoof",
    "X-Request-Id": "request-test", "Content-Type": "application/json",
  }, body: JSON.stringify({ nickname: "초록이" }) }), "/api/signup");
  assert.equal(result.status, 409);
  assert.equal((await result.json()).error.code, "EMAIL_IN_USE");
  assert.equal(result.headers.getSetCookie().length, 1);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
});

test("proxy blocks unsupported upstream paths and reports network failures", async () => {
  let calls = 0;
  const proxy = createSessionProxy({ baseUrl: "http://spring:8080", fetch: async () => { calls++; throw new TypeError("offline"); } });
  assert.equal((await proxy(new Request("http://web"), "https://foreign.test/")).status, 500);
  assert.equal(calls, 0);
  const result = await proxy(new Request("http://web"), "/api/auth/me");
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.code, "BACKEND_UNAVAILABLE");
});

const member = { userId: "member-a", email: "a@example.test", nickname: "초록이" };
const isError = (code: string, uncertain = false) => (error: unknown) =>
  error instanceof AccountError && error.code === code && error.outcomeUnknown === uncertain;

test("member client rejects malformed responses without exposing raw body or exception messages", async () => {
  const invalid = [
    () => new Response('<html>private-token</html>', { headers: { "Content-Type": "text/html" } }),
    () => new Response('{private-token', { headers: { "Content-Type": "application/json" } }),
    () => Response.json(null), () => Response.json([]),
    () => envelope({ userId: "member-a" }),
    () => envelope(member, 200, { code: "INTERNAL_ERROR", message: "private-token" }),
    () => envelope(null, 401, { code: "INVALID_CREDENTIALS" }),
  ];
  for (const response of invalid) {
    await assert.rejects(createAccountClient(async () => response()).me(), error => {
      assert.ok(isError("BACKEND_INVALID_RESPONSE")(error));
      assert.ok(!(error as Error).message.includes("private-token")); return true;
    });
  }
  await assert.rejects(createAccountClient(async () => { throw new TypeError("private-token"); }).me(), isError("NETWORK_ERROR"));
});

test("known auth/CSRF/business codes get safe messages, and QA challenge is separate from app logout", async () => {
  for (const [status, code] of [[401, "AUTHENTICATION_REQUIRED"], [403, "CSRF_INVALID"], [401, "INVALID_CREDENTIALS"], [409, "EMAIL_IN_USE"], [500, "INTERNAL_ERROR"]] as const) {
    await assert.rejects(createAccountClient(async () => envelope(null, status, { code, message: "private-token" })).me(), error => {
      assert.ok(error instanceof AccountError); assert.equal(error.status, status); assert.equal(error.code, code);
      assert.ok(!error.message.includes("private-token")); return true;
    });
  }
  await assert.rejects(createAccountClient(async () => new Response("", { status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="eco-app-qa", charset="UTF-8"' } })).me(), isError("QA_AUTH_REQUIRED"));
});

test("failed CSRF preflight never sends a mutation; an explicit retry obtains a new token", async () => {
  const calls: string[] = []; let attempt = 0;
  const client = createAccountClient(async path => {
    calls.push(String(path));
    if (String(path).endsWith("csrf")) return ++attempt === 1
      ? envelope(null, 503, { code: "BACKEND_UNAVAILABLE", message: "private-token" })
      : envelope({ token: "fresh-token", headerName: "X-CSRF-TOKEN" });
    return envelope({ userId: "member-a" }, 201);
  });
  await assert.rejects(client.signup("a@example.test", "password123", ""), isError("BACKEND_UNAVAILABLE"));
  assert.deepEqual(calls, ["/api/auth/csrf"]);
  await client.signup("a@example.test", "password123", "");
  assert.deepEqual(calls, ["/api/auth/csrf", "/api/auth/csrf", "/api/signup"]);
});

test("mutation response loss is uncertain and never retried; successful-looking invalid data is not accepted", async () => {
  for (const outcome of ["network", "invalid", "server", "csrf"] as const) {
    const calls: string[] = [];
    const client = createAccountClient(async path => {
      calls.push(String(path));
      if (String(path).endsWith("csrf")) return envelope({ token: "fresh-token", headerName: "X-CSRF-TOKEN" });
      if (outcome === "network") throw new TypeError("private-token");
      if (outcome === "invalid") return envelope({});
      return envelope(null, outcome === "server" ? 503 : 403, { code: outcome === "server" ? "BACKEND_UNAVAILABLE" : "CSRF_INVALID", message: "private-token" });
    });
    await assert.rejects(client.signup("a@example.test", "password123", ""), error => {
      assert.ok(error instanceof AccountError); assert.equal(error.outcomeUnknown, outcome !== "csrf"); return true;
    });
    assert.deepEqual(calls, ["/api/auth/csrf", "/api/signup"]);
  }
});

test("proxy rejects malformed and mismatched responses while preserving session cookies", async () => {
  for (const kind of ["html", "json", "id", "shape", "message"] as const) {
    const proxy = createSessionProxy({ baseUrl: "http://spring:8080", fetch: async () => {
      const response = kind === "html" ? new Response("private-token", { headers: { "Content-Type": "text/html" } })
        : kind === "json" ? new Response("private-token", { headers: { "Content-Type": "application/json" } })
        : kind === "id" ? envelope(member, 200, null, "wrong-id")
        : kind === "shape" ? envelope({}, 200, null, "request-test")
        : envelope(null, 500, { code: "INTERNAL_ERROR", message: "private-token" }, "request-test");
      response.headers.append("Set-Cookie", "ECOTEAMSESSION=rotated; Path=/; HttpOnly");
      response.headers.append("Set-Cookie", "SECOND=fixture; Path=/; HttpOnly");
      return response;
    } });
    const r = await proxy(new Request("http://web/api/auth/me", { headers: { "X-Request-Id": "request-test" } }), "/api/auth/me");
    assert.equal(r.status, kind === "message" ? 500 : 503);
    assert.equal(r.headers.getSetCookie().length, 2);
    assert.equal(r.headers.get("X-Request-Id"), "request-test");
    assert.ok(!(await r.text()).includes("private-token"));
  }
});

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
function close(server: Server) {
  server.closeAllConnections(); return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test("real HTTP: body timeout is bounded in client and proxy, cookie rotation survives proxy timeout", async t => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    res.writeHead(200, { "Content-Type": "application/json", "X-Request-Id": req.headers["x-request-id"] ?? "test",
      "Set-Cookie": "ECOTEAMSESSION=rotated; Path=/; HttpOnly" });
    res.flushHeaders(); // Never finish the body; only the request deadline can release it.
  });
  const baseUrl = await listen(server); t.after(() => close(server));
  const client = createAccountClient((path, init) => fetch(baseUrl + String(path), init), 150);
  await assert.rejects(client.me(), isError("REQUEST_TIMEOUT"));
  const proxy = createSessionProxy({ baseUrl, timeoutMs: 150 });
  const result = await proxy(new Request("http://web/api/auth/me", { headers: { "X-Request-Id": "request-test" } }), "/api/auth/me");
  assert.equal(result.status, 504);
  assert.equal((await result.json()).error.code, "BACKEND_TIMEOUT");
  assert.equal(result.headers.getSetCookie().length, 1);
  assert.equal(calls, 2);
});

test("real HTTP: cancellation is not reported as a server fault, and member envelopes survive the BFF", async t => {
  const server = createServer((req, res) => {
    if (req.url === "/api/auth/csrf") { res.writeHead(200, { "Content-Type": "application/json" }); res.flushHeaders(); return; }
    const requestId = String(req.headers["x-request-id"] ?? "test");
    res.writeHead(200, { "Content-Type": "application/json", "X-Request-Id": requestId,
      "Set-Cookie": "ECOTEAMSESSION=normal; Path=/; HttpOnly; SameSite=Lax" });
    res.end(JSON.stringify({ data: member, error: null, requestId }));
  });
  const baseUrl = await listen(server); t.after(() => close(server));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createAccountClient((path, init) => fetch(baseUrl + String(path), init)).me(controller.signal), isError("REQUEST_CANCELLED"));
  const proxy = createSessionProxy({ baseUrl });
  const aborted = await proxy(new Request("http://web/api/auth/me", { signal: controller.signal }), "/api/auth/me");
  assert.equal(aborted.status, 499);
  const result = await proxy(new Request("http://web/api/auth/me", { headers: { "X-Request-Id": "request-test" } }), "/api/auth/me");
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).data, member);
  assert.match(result.headers.getSetCookie()[0], /ECOTEAMSESSION=normal/);
});
