import test from "node:test";
import assert from "node:assert/strict";
import { createSessionFetch } from "../src/features/profile/session-fetch.ts";

const reply = (status: number, code = "AUTHENTICATION_REQUIRED", headers = {}) => Response.json({
  data: null, error: { code, message: "test" }, requestId: "session-test",
}, { status, headers });
function location(path = "/missions/detail?batchId=batch&itemId=item&returnTo=%2Fmissions") {
  const calls: string[] = [];
  return { calls, current: { href: "https://app.local" + path, replace: (url: string) => { calls.push(url); } } };
}

test("all member screens return to the exact screen/query; response stays readable and redirects deduplicate", async () => {
  for (const path of ["/profile", "/profile/neighborhood", "/onboarding?mode=edit", "/missions?batchId=b&itemId=i",
    "/missions/detail?batchId=b&itemId=i&returnTo=%2Fmissions", "/map/mission?batchId=b&itemId=i", "/chat?batchId=b&itemId=i"]) {
    const state = location(path);
    const fetcher = createSessionFetch(async () => reply(401), () => state.current);
    const response = await fetcher("/api/missions/events", { method: "POST" });
    assert.equal((await response.json()).error.code, "AUTHENTICATION_REQUIRED");
    await fetcher("/api/profile/interests");
    assert.equal(state.calls.length, 1);
    const target = new URL(state.calls[0], "https://app.local");
    assert.equal(target.pathname, "/login"); assert.equal(target.searchParams.get("next"), path);
    assert.equal(target.searchParams.get("reason"), "session-expired");
  }
});

test("expiry from a CSRF 403 verifies membership once and does not repeat the mutation", async () => {
  for (const expired of [true, false]) {
    const state = location(); const calls: string[] = [];
    const fetcher = createSessionFetch(async input => {
      calls.push(String(input));
      return String(input) === "/api/auth/me" ? reply(expired ? 401 : 200) : reply(403, "CSRF_INVALID");
    }, () => state.current);
    const response = await fetcher("/api/missions/events", { method: "POST" });
    assert.equal(response.status, expired ? 401 : 403);
    assert.deepEqual(calls, ["/api/missions/events", "/api/auth/me"]);
    assert.equal(state.calls.length, expired ? 1 : 0);
  }
});

test("public screens, auth forms, logout, off-origin requests and QA protection do not trigger app login", async () => {
  for (const page of ["/", "/map", "/login", "/signup"]) {
    const state = location(page);
    await createSessionFetch(async () => reply(401), () => state.current)("/api/auth/me");
    assert.deepEqual(state.calls, []);
  }
  for (const request of ["/api/auth/login", "/api/signup", "/api/auth/logout", "https://elsewhere.test/api/auth/me"]) {
    const state = location();
    await createSessionFetch(async () => reply(401), () => state.current)(request);
    assert.deepEqual(state.calls, []);
  }
  const state = location();
  for (const response of [reply(401,"AUTHENTICATION_REQUIRED",{"WWW-Authenticate":"Basic realm=eco-app-qa"}),
    reply(401, "INVALID_CREDENTIALS"), new Response("bad gateway",{status:401}), reply(503), reply(429)]) {
    await createSessionFetch(async () => response, () => state.current)("/api/chat");
  }
  assert.deepEqual(state.calls, []);
});

test("network errors and failed membership verification retain the original outcome without retry", async () => {
  const state=location(); let calls=0;
  const fetcher=createSessionFetch(async () => { calls++; throw new TypeError("network"); }, () => state.current);
  await assert.rejects(fetcher("/api/profile/interests",{method:"PUT"}), TypeError);
  assert.equal(calls,1); assert.deepEqual(state.calls,[]);
  const forbidden=reply(403,"CSRF_INVALID");
  const verify=createSessionFetch(async input => { if(input==="/api/auth/me") throw new TypeError("network"); return forbidden; },()=>state.current);
  assert.equal(await verify("/api/missions/events",{method:"POST"}),forbidden);
  assert.deepEqual(state.calls,[]);
});

test("aborted and stale requests never redirect a later screen", async () => {
  const state=location(); const controller=new AbortController();
  const aborted=createSessionFetch(async()=>{controller.abort();return reply(401);},()=>state.current);
  await aborted("/api/chat",{signal:controller.signal}); assert.deepEqual(state.calls,[]);
  const stale=createSessionFetch(async()=>{state.current.href="https://app.local/profile";return reply(401);},()=>state.current);
  await stale("/api/chat"); assert.deepEqual(state.calls,[]);
});
