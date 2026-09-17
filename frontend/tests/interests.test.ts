import test from "node:test";
import assert from "node:assert/strict";
import { isInterestProfile, isInterestSelectionInput } from "../src/features/profile/interests-contract.ts";
import { createInterestHandlers } from "../src/lib/server/interests-bff.ts";
import { createInterestSpring, type InterestSpring } from "../src/lib/server/profile-interests.ts";

const options = [
  { id: "eco-learning", title: "환경 체험·배우기", description: "교육·체험·기후행동" },
  { id: "green-mobility", title: "교통비·친환경 이동", description: "대중교통·자전거·친환경차" },
  { id: "unsure", title: "아직 잘 모르겠어요", description: "분야별 추천" },
];
const profile = { options, interestIds: ["eco-learning"] };
const ok = (requestId: string) => ({ status: 200, body: { data: profile, error: null, requestId } });

function put(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://eco.test/api/profile/interests", {
    method: "PUT",
    headers: { Origin: "https://eco.test", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("interest contracts accept clear and unsure but reject duplicates, mixed unsure, and invalid views", () => {
  assert.equal(isInterestSelectionInput({ interestIds: [] }), true);
  assert.equal(isInterestSelectionInput({ interestIds: ["unsure"] }), true);
  assert.equal(isInterestSelectionInput({ interestIds: ["eco-learning", "eco-learning"] }), false);
  assert.equal(isInterestSelectionInput({ interestIds: ["unsure", "eco-learning"] }), false);
  assert.equal(isInterestSelectionInput({ interestIds: [1] }), false);
  assert.equal(isInterestSelectionInput({ interestIds: [], userId: "other" }), false);
  assert.equal(isInterestProfile(profile), true);
  assert.equal(isInterestProfile({ options, interestIds: ["missing"] }), false);
  assert.equal(isInterestProfile({ options, interestIds: ["unsure", "eco-learning"] }), false);
});

test("BFF GET forwards only the session cookie and PUT forwards the validated body with CSRF", async () => {
  const observed: unknown[][] = [];
  const spring: InterestSpring = {
    async get(requestId, cookie) {
      observed.push(["get", requestId, cookie]);
      return ok(requestId!);
    },
    async replace(value, requestId, cookie, csrf) {
      observed.push(["replace", value, requestId, cookie, csrf]);
      return ok(requestId!);
    },
  };
  const handlers = createInterestHandlers({ spring });
  const get = new Request("https://eco.test/api/profile/interests", {
    headers: { Cookie: "ECOTEAMSESSION=owner", "X-Request-Id": "get-1", "X-User-Id": "other" },
  });
  assert.equal((await handlers.get(get)).status, 200);
  const request = put({ interestIds: ["eco-learning"] }, {
    Cookie: "ECOTEAMSESSION=owner", "X-CSRF-TOKEN": "csrf", "X-Request-Id": "put-1", "X-User-Id": "other",
  });
  assert.equal((await handlers.put(request)).status, 200);
  assert.deepEqual(observed, [
    ["get", "get-1", "ECOTEAMSESSION=owner"],
    ["replace", { interestIds: ["eco-learning"] }, "put-1", "ECOTEAMSESSION=owner", "csrf"],
  ]);
});

test("BFF rejects cross-origin, malformed, duplicate, mixed, and owner-bearing writes before Spring", async () => {
  let calls = 0;
  const spring: InterestSpring = {
    async get(requestId) { return ok(requestId!); },
    async replace() { calls++; throw new Error("must not call"); },
  };
  const handlers = createInterestHandlers({ spring });
  const crossOrigin = put({ interestIds: [] }, { Origin: "https://evil.test" });
  assert.equal((await handlers.put(crossOrigin)).status, 403);
  for (const body of [
    null,
    { interestIds: [1] },
    { interestIds: ["eco-learning", "eco-learning"] },
    { interestIds: ["unsure", "eco-learning"] },
    { interestIds: [], userId: "other" },
  ]) assert.equal((await handlers.put(put(body))).status, 400);
  assert.equal(calls, 0);
});

test("BFF bounds body size and read time and cancels unfinished input", async () => {
  let calls = 0;
  const spring: InterestSpring = {
    async get(requestId) { return ok(requestId!); },
    async replace() { calls++; throw new Error("must not call"); },
  };
  const handlers = createInterestHandlers({ spring, bodyTimeoutMs: 25, maxBodyBytes: 64 });
  assert.equal((await handlers.put(put({ interestIds: ["x".repeat(80)] }))).status, 413);

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const request = new Request("https://eco.test/api/profile/interests", {
    method: "PUT", headers: { Origin: "https://eco.test", "Content-Type": "application/json" },
    body: stream, duplex: "half",
  } as RequestInit);
  assert.equal((await handlers.put(request)).status, 504);
  assert.equal(cancelled, true);

  cancelled = false;
  const controller = new AbortController();
  const disconnected = new Request("https://eco.test/api/profile/interests", {
    method: "PUT", headers: { Origin: "https://eco.test", "Content-Type": "application/json" },
    body: new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), duplex: "half",
    signal: controller.signal,
  } as RequestInit);
  const pending = handlers.put(disconnected);
  controller.abort();
  assert.equal((await pending).status, 504);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("Spring helper uses the fixed path and selects only Cookie and CSRF headers", async () => {
  const calls: { url: string; method: string; headers: Headers; body: string | null }[] = [];
  const spring = createInterestSpring({ baseUrl: "http://spring:8080", fetch: async (input, init) => {
    const headers = new Headers(init?.headers);
    const requestId = headers.get("X-Request-Id")!;
    calls.push({ url: String(input), method: init?.method ?? "GET", headers, body: init?.body?.toString() ?? null });
    return Response.json({ data: profile, error: null, requestId }, {
      headers: { "X-Request-Id": requestId },
    });
  } });
  assert.equal((await spring.get("read-1", "ECOTEAMSESSION=owner")).status, 200);
  assert.equal((await spring.replace({ interestIds: [] }, "write-1", "ECOTEAMSESSION=owner", "csrf")).status, 200);
  assert.deepEqual(calls.map(call => [call.url, call.method]), [
    ["http://spring:8080/api/profile/interests", "GET"],
    ["http://spring:8080/api/profile/interests", "PUT"],
  ]);
  assert.equal(calls[0].headers.get("Cookie"), "ECOTEAMSESSION=owner");
  assert.equal(calls[0].headers.get("X-CSRF-TOKEN"), null);
  assert.equal(calls[1].headers.get("Cookie"), "ECOTEAMSESSION=owner");
  assert.equal(calls[1].headers.get("X-CSRF-TOKEN"), "csrf");
  assert.equal(calls[1].body, JSON.stringify({ interestIds: [] }));
});
