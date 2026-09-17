import test from "node:test";
import assert from "node:assert/strict";
import { createNeighborhoodClient } from "../src/features/profile/neighborhood-client.ts";

const neighborhood = { regionCode: "1230059000", sido: "전남광주통합특별시", sigungu: "북구", dong: "용봉동" };
const envelope = (data: unknown, error: unknown = null) => Response.json({ data, error, requestId: "client-1" });

test("save obtains CSRF and rejects a successful envelope without a saved neighborhood", async () => {
  let calls = 0;
  const client = createNeighborhoodClient(async (input, init) => {
    calls++;
    if (String(input) === "/api/auth/csrf") return envelope({ token: "csrf", headerName: "X-CSRF-TOKEN" });
    assert.equal(init?.method, "PUT"); assert.equal(new Headers(init?.headers).get("X-CSRF-TOKEN"), "csrf");
    assert.deepEqual(JSON.parse(String(init?.body)), neighborhood);
    return envelope({ neighborhood: null });
  });
  await assert.rejects(client.save(neighborhood), { code: "INVALID_RESPONSE" });
  assert.equal(calls, 2);
});


test("resolve preserves the address-point notice and rejects a malformed notice", async () => {
  const result = { candidates: [neighborhood], hasMore: false, emptyReason: null, usedAddressPoint: true };
  assert.deepEqual(await createNeighborhoodClient(async () => envelope(result)).resolve({ query: "성수동" }), result);
  await assert.rejects(createNeighborhoodClient(async () => envelope({ ...result, usedAddressPoint: "true" }))
    .resolve({ query: "성수동" }), { code: "INVALID_RESPONSE" });
});

import { loginReturnPath } from "../src/features/profile/login-return.ts";

test("login return allows known member pages and rejects untrusted destinations", () => {
  assert.equal(loginReturnPath("/profile/neighborhood"), "/profile/neighborhood");
  for (const value of ["https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)", ["/missions"], "/login", undefined])
    assert.equal(loginReturnPath(value), "/profile");
});

test("uncertain PUT result is marked for verification and never retried automatically", async () => {
  let writes = 0;
  const client = createNeighborhoodClient(async (input) => {
    if (String(input) === "/api/auth/csrf") return envelope({ token: "csrf", headerName: "X-CSRF-TOKEN" });
    writes++; throw new TypeError("response lost after write");
  });
  await assert.rejects(client.save(neighborhood), { outcomeUnknown: true });
  assert.equal(writes, 1);
});

test("failure before PUT does not imply an uncertain save", async () => {
  let writes = 0;
  const client = createNeighborhoodClient(async (_input, init) => {
    if (init?.method === "PUT") writes++;
    throw new TypeError("CSRF unavailable");
  });
  await assert.rejects(client.save(neighborhood), TypeError);
  assert.equal(writes, 0);
});

test("save distinguishes expired session from a valid session's CSRF rejection", async () => {
  for (const expired of [true, false]) {
    const client = createNeighborhoodClient(async (input, init) => {
      if (String(input) === "/api/auth/csrf") return envelope({ token: "csrf", headerName: "X-CSRF-TOKEN" });
      if (init?.method === "PUT") return Response.json({ data: null, error: { code: "CSRF_INVALID", message: "rejected" }, requestId: "client-1" }, {status:403});
      return expired
        ? Response.json({ data: null, error: { code: "AUTHENTICATION_REQUIRED", message: "expired" }, requestId: "client-1" }, {status:401})
        : envelope({neighborhood});
    });
    await assert.rejects(client.save(neighborhood), { status: expired ? 401 : 403, outcomeUnknown: false });
  }
});
