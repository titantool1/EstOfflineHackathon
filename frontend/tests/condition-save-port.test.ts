import assert from "node:assert/strict";
import { test } from "node:test";
import { createConditionSavePort } from "../src/lib/server/chat/condition-save-port.ts";
import type { ConditionSaveRequest } from "../src/lib/server/ai/application/condition-save.ts";

const request: ConditionSaveRequest = { conversationId: "00000000-0000-4000-8000-000000000010",
  ownerId: "00000000-0000-4000-8000-000000000001", attemptId: "00000000-0000-4000-8000-000000000020", changes: [] };
const envelope = (data: unknown, id: string, init: ResponseInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json"); headers.set("X-Request-Id", id);
  return Response.json({ data, error: null, requestId: id }, { ...init, headers });
};

test("condition-save port obtains CSRF, adopts the refreshed session cookie, and accepts nullable extra data", async () => {
  const calls: Array<{ path: string; headers: Headers; body?: string }> = [];
  const port = createConditionSavePort({ baseUrl: "https://spring.test", cookie: () => "ECOTEAMSESSION=old", fetch: async (url, init) => {
    const path = new URL(String(url)).pathname, headers = new Headers(init?.headers);
    calls.push({ path, headers, body: init?.body?.toString() });
    const id = headers.get("X-Request-Id")!;
    if (path === "/api/auth/csrf") return envelope({ headerName: "X-CSRF-TOKEN", token: "csrf" }, id,
      { headers: { "Set-Cookie": "ECOTEAMSESSION=fresh; Path=/; HttpOnly" } });
    return envelope({ status: "saved", current: null, extra: null }, id);
  } });
  assert.deepEqual(await port.save(request), { status: "saved" });
  assert.deepEqual(calls.map(call => call.path), ["/api/auth/csrf", "/api/profile/condition-save"]);
  assert.equal(calls[1].headers.get("Cookie"), "ECOTEAMSESSION=fresh");
  assert.equal(calls[1].headers.get("X-CSRF-TOKEN"), "csrf");
  assert.deepEqual(JSON.parse(calls[1].body!), request);
});

test("validated rejection stays rejected while HTTP or malformed outcomes are unconfirmed", async () => {
  const responses = [
    { data: { status: "rejected", reason: "CONFLICT", current: null }, status: 200 },
    { data: { status: "rejected", reason: "UNKNOWN" }, status: 200 },
  ];
  const port = createConditionSavePort({ baseUrl: "https://spring.test", cookie: () => "ECOTEAMSESSION=test", fetch: async (_url, init) => {
    const id = new Headers(init?.headers).get("X-Request-Id")!;
    if (new Headers(init?.headers).has("X-CSRF-TOKEN")) {
      const next = responses.shift()!; return envelope(next.data, id, { status: next.status });
    }
    return envelope({ headerName: "X-CSRF-TOKEN", token: "csrf" }, id);
  } });
  assert.deepEqual(await port.save(request), { status: "rejected" });
  assert.deepEqual(await port.save(request), { status: "outcome_unconfirmed" });
});
