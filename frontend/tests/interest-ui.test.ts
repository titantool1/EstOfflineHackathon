import test from "node:test";
import assert from "node:assert/strict";
import { createInterestClient, InterestClientError } from "../src/features/profile/interests-client.ts";
import { interestDescription, toggleInterest } from "../src/features/profile/interest-selection.ts";

const options = [
  { id: "eco-learning", title: "환경 체험·배우기", description: "교육·체험·기후행동" },
  { id: "green-mobility", title: "교통비·친환경 이동", description: "대중교통·자전거·친환경차" },
  { id: "home-energy", title: "주거 에너지", description: "에너지 절약" },
  { id: "resource-circulation", title: "자원순환", description: "분리배출" },
  { id: "green-consumption", title: "친환경 소비", description: "구매" },
  { id: "sustainable-food", title: "지속가능한 식생활", description: "식생활" },
  { id: "unsure", title: "아직 잘 모르겠어요", description: "운영 중인 3~5개 추천" },
];
const profile = { options, interestIds: ["eco-learning"] };
const envelope = (data: unknown, status = 200) => Response.json(
  { data: status < 400 ? data : null, error: status < 400 ? null : data, requestId: "interest-ui-1" }, { status });

test("interest client loads the seven DB options and explicitly PUTs a CSRF-protected selection", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = createInterestClient(async (input, init) => {
    const path = String(input); calls.push({ path, init });
    if (path === "/api/auth/csrf") return envelope({ token: "fresh", headerName: "X-CSRF-TOKEN" });
    return envelope(profile);
  });
  assert.equal((await client.get()).options.length, 7);
  assert.deepEqual(await client.save({ interestIds: ["eco-learning"] }), profile);
  assert.deepEqual(calls.map(call => [call.path, call.init?.method]), [
    ["/api/profile/interests", undefined], ["/api/auth/csrf", undefined], ["/api/profile/interests", "PUT"],
  ]);
  assert.equal(new Headers(calls[2].init?.headers).get("X-CSRF-TOKEN"), "fresh");
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { interestIds: ["eco-learning"] });
});

test("interest choices keep unsure exclusive and allow a complete clear", () => {
  assert.deepEqual(toggleInterest(["eco-learning"], "unsure"), ["unsure"]);
  assert.deepEqual(toggleInterest(["unsure"], "green-mobility"), ["green-mobility"]);
  assert.deepEqual(toggleInterest(["green-mobility"], "green-mobility"), []);
  assert.equal(interestDescription("unsure", options[6].description), "분야를 정하지 않고 여러 활동을 둘러볼게요");
  assert.equal(interestDescription("eco-learning", options[0].description), options[0].description);
});

test("interest client keeps authentication failures distinct from invalid responses", async () => {
  const unauthorized = createInterestClient(async () => envelope({ code: "AUTHENTICATION_REQUIRED", message: "로그인이 필요합니다." }, 401));
  await assert.rejects(unauthorized.get(), (error: unknown) => error instanceof InterestClientError
    && error.status === 401 && error.code === "AUTHENTICATION_REQUIRED");
  const malformed = createInterestClient(async () => Response.json({ data: profile }));
  await assert.rejects(malformed.get(), { status: 503, code: "INVALID_RESPONSE" });
});
