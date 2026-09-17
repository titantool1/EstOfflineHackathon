import test from "node:test";
import assert from "node:assert/strict";
import { missionLevel, isMissionProgress, sameMission } from "../src/features/missions/progress.ts";
import { createMissionClient } from "../src/features/missions/client.ts";
import { createMissionsSpring } from "../src/lib/server/missions-spring.ts";
import { createMissionHandlers } from "../src/lib/server/missions-bff.ts";

test("levels require successively 1, 2, 3 new missions, without losing progress at boundaries", () => {
  const expected = [[0,1,0,1], [1,2,0,2], [2,2,1,1], [3,3,0,3], [5,3,2,1], [6,4,0,4], [9,4,3,1], [10,5,0,5]];
  for (const [total, level, completed, remaining] of expected) {
    assert.deepEqual(missionLevel(total), { level, completedInLevel: completed, required: level, remaining });
  }
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(isMissionProgress({ completedMissionCount: invalid }), false);
    assert.throws(() => missionLevel(invalid), RangeError);
  }
  for (const invalid of [null, [], {}, { completedMissionCount: "3" }]) assert.equal(isMissionProgress(invalid), false);
});

test("progress uses authenticated session, no cache and fixed paths even with a spoofed owner", async () => {
  const spring = createMissionsSpring({ baseUrl: "http://spring:8080", fetch: async (url, init) => {
    assert.equal(String(url), "http://spring:8080/api/missions/events/progress");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Cookie"), "ECOTEAMSESSION=owner");
    assert.equal(headers.has("X-User-Id"), false);
    return Response.json({ data: { completedMissionCount: 1, acceptedMissions: [], completedMissions: [{ programKey: "p1", actionId: "a1" }] }, error: null, requestId: "progress-1" },
      { headers: { "X-Request-Id": "progress-1" } });
  }});
  const response = await createMissionHandlers({ spring }).getProgress(new Request("https://eco.test/api/missions/progress?userId=other", {
    headers: { Cookie: "ECOTEAMSESSION=owner", "X-User-Id": "other", "X-Request-Id": "progress-1" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await response.json()).data, { completedMissionCount: 1, acceptedMissions: [], completedMissions: [{ programKey: "p1", actionId: "a1" }] });
});

test("progress client rejects failed and invalid reads instead of displaying a fake zero", async () => {
  for (const [status, data] of [[503, null], [200, { completedMissionCount: -1 }]] as const) {
    const client = createMissionClient(async (url, init) => {
      assert.equal(url, "/api/missions/progress");
      assert.equal(init?.cache, "no-store");
      return Response.json({ data, error: status === 503 ? { code: "UNAVAILABLE", message: "잠시 후 다시 시도" } : null,
        requestId: "progress-failed" }, { status });
    });
    await assert.rejects(client.getProgress());
  }
});


test("completion identities must match the count and distinguish program plus action", () => {
  const mission = { programKey: "p1", actionId: "a1" };
  assert.equal(isMissionProgress({ completedMissionCount: 1, acceptedMissions: [], completedMissions: [mission] }), true);
  assert.equal(isMissionProgress({ completedMissionCount: 0, acceptedMissions: [], completedMissions: [] }), true);
  for (const value of [
    { completedMissionCount: 1 },
    { completedMissionCount: 1, acceptedMissions: [], completedMissions: [] },
    { completedMissionCount: 2, acceptedMissions: [], completedMissions: [mission, mission] },
    { completedMissionCount: 1, acceptedMissions: [], completedMissions: [{ actionId: "a1" }] },
    { completedMissionCount: 1, acceptedMissions: [], completedMissions: [null] },
  ]) assert.equal(isMissionProgress(value), false);
  assert.equal(sameMission(mission, { ...mission }), true);
  assert.equal(sameMission(mission, { ...mission, programKey: "p2" }), false);
});

test("accepted identities are required, unique, and never counted as completion", () => {
  const mission = { programKey: "p1", actionId: "a1" };
  const value = { completedMissionCount: 0, completedMissions: [], acceptedMissions: [mission] };
  assert.equal(isMissionProgress(value), true);
  assert.equal(missionLevel(value.completedMissionCount).level, 1);
  for (const acceptedMissions of [undefined, null, [null], [{actionId:"a1"}], [mission, mission]])
    assert.equal(isMissionProgress({ ...value, acceptedMissions }), false);
  assert.equal(isMissionProgress({ ...value, acceptedMissions: [mission, { ...mission, programKey: "p2" }] }), true);
  assert.equal(isMissionProgress({ ...value, completedMissionCount: 1, completedMissions: [mission] }), true);
});
