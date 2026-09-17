import { test } from "node:test";
import assert from "node:assert/strict";
import { loginHref, loginReturnPath, neighborhoodLoginUrl } from "../src/features/profile/login-return.ts";

test("login returns to chat and keeps owned mission and board query context", () => {
  const returnTo = "/missions?interestBatchId=00000000-0000-4000-8000-000000000001&interestItemId=00000000-0000-4000-8000-000000000010";
  const chat = "/chat?" + new URLSearchParams({ batchId: "00000000-0000-4000-8000-000000000001", itemId: "00000000-0000-4000-8000-000000000010", returnTo });
  assert.equal(loginReturnPath(chat), chat);
  const login = new URL(loginHref(chat, true), "https://app.local");
  assert.equal(login.searchParams.get("next"), chat);
  assert.equal(loginReturnPath(login.searchParams.get("next")), chat);
  assert.equal(login.searchParams.get("reason"), "session-expired");
  assert.equal(loginReturnPath("/chat"), "/chat");
});
test("local entry pages retain edit/detail context and neighborhood return stays compatible", () => {
  for (const path of ["/", "/profile", "/profile/neighborhood", "/onboarding?mode=edit", "/missions?batchId=x&itemId=y", "/missions/detail?batchId=x", "/map/mission?itemId=y"])
    assert.equal(loginReturnPath(path), path);
  assert.equal(new URL(neighborhoodLoginUrl, "https://app.local").searchParams.get("next"), "/profile/neighborhood");
});
test("untrusted return values cannot redirect away or loop through auth pages", () => {
  for (const path of [undefined, null, [], "/login?next=/chat", "/signup", "https://evil.test/chat", "//evil.test/chat", "/\\evil.test/chat", "javascript:alert(1)", "/%2f%2fevil.test", "/\n/evil.test/chat", " /chat", "/unknown"])
    assert.equal(loginReturnPath(path), "/profile", String(path));
});
