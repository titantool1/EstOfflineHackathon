import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountClient, AccountError } from "../src/features/profile/account-client.ts";
import { createSessionProxy } from "../src/lib/server/session-proxy.ts";

const envelope = (data: unknown, status = 200, error: unknown = null) => Response.json({ data, error, requestId: "test" }, { status });

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
    return envelope({ userId: "user" });
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
    const response = envelope(null, 409, { code: "EMAIL_IN_USE", message: "중복" });
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
