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
