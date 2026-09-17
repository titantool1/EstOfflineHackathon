import { test } from "node:test";
import assert from "node:assert/strict";
import { createUserConditionLoader, projectUserConditionContext } from "../src/lib/server/ai/adapters/user-condition-context.ts";
import type { UserConditionContext } from "../src/lib/server/ai/adapters/user-condition-context.ts";
import { applyConditionChanges, readConditionFact } from "../src/lib/server/ai/application/condition-memory.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const selection = { programKey: "scheme:G031", actionId: "G031-A01" };
function context(): UserConditionContext {
  return {
    userId: owner, ...selection, eligibilityStatus: "not_evaluated",
    inputs: [
      { inputKey: "membership.is_member", selector: { service_code: "eco_mileage" },
        target: { kind: "self", id: owner, householdId: null }, valueType: "boolean", conditionIds: ["c1"],
        fact: { value: false, evidence: [{ observedAt: "2026-09-17T00:00:00Z", sourceKind: "user_statement", reference: null }] } },
      { inputKey: "person.birth_date", selector: {}, target: { kind: "self", id: owner, householdId: null },
        valueType: "date", conditionIds: ["c2"], fact: null },
    ],
    unselectedInputs: [{ inputKey: "home.dwelling_type", selector: {}, targetKind: "home", conditionIds: ["c3"] }],
    unmappedConditionIds: ["c4"], households: [],
  };
}
function response(data: unknown, init?: RequestInit, status = 200) {
  const requestId = new Headers(init?.headers).get("X-Request-Id");
  return Response.json({ data: status === 200 ? data : null,
    error: status === 200 ? null : { code: "CONDITION_CONTEXT_NOT_FOUND", message: "대상 없음" }, requestId },
  { status, headers: { "X-Request-Id": requestId! } });
}

test("DB false and missing stay distinct; unselected and unmapped inputs stay outside memory", () => {
  const input = context(), before = structuredClone(input);
  const result = projectUserConditionContext(input, owner, selection);
  assert.equal(result.memory.slots.length, 2);
  assert.equal(readConditionFact(result.memory, result.bindings[0].slotId).value, false);
  assert.equal(readConditionFact(result.memory, result.bindings[1].slotId).status, "missing");
  assert.deepEqual(result.context.unmappedConditionIds, ["c4"]);
  assert.equal(result.context.unselectedInputs.length, 1);
  assert.equal(result.memory.slots[0].initial?.source.kind, "database");
  assert.deepEqual(input, before);
});

test("household metadata binds members; wrong owner/target and malformed facts are rejected", () => {
  const input = context();
  input.households = [{ id: "household", membersComplete: false,
    members: [{ id: "child", relationToApplicant: "child", onResidentRegister: null }] }];
  input.inputs[1].target = { kind: "member", id: "child", householdId: "household" };
  const selected = { ...selection, householdId: "household" };
  const result = projectUserConditionContext(input, owner, selected);
  assert.equal(result.memory.slots[1].input.target.kind, "member");
  assert.equal(result.context.households[0].membersComplete, false);
  assert.throws(() => projectUserConditionContext(input, "other", selected));
  assert.throws(() => projectUserConditionContext(input, owner, selection));
  input.inputs[1].target.id = "stranger";
  assert.throws(() => projectUserConditionContext(input, owner, selected));
  const bad = context();
  bad.inputs[1].fact = { value: "2026-02-30", evidence: [{ observedAt: "2026-09-17", sourceKind: "user_statement" }] };
  assert.throws(() => projectUserConditionContext(bad, owner, selection));
  bad.inputs[1].fact = null;
  bad.inputs[0].fact!.evidence[0].observedAt = "invalid";
  assert.throws(() => projectUserConditionContext(bad, owner, selection));
});

test("repeated facts share slots and retain bindings; contradictory facts fail", () => {
  const input = context();
  input.inputs.push({ ...structuredClone(input.inputs[0]), conditionIds: ["c5"] });
  const projected = projectUserConditionContext(input, owner, selection);
  assert.equal(projected.memory.slots.length, 2);
  assert.equal(projected.bindings[0].slotId, projected.bindings[2].slotId);
  input.inputs[2].fact!.value = true;
  assert.throws(() => projectUserConditionContext(input, owner, selection), /CONFLICTING/);
});

test("loader forwards selected session credentials, initializes memory and preserves conversation corrections", async () => {
  const load = createUserConditionLoader({ baseUrl: "http://spring:8080", fetch: async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.pathname, "/api/profile/condition-context");
    assert.equal(target.searchParams.get("programKey"), selection.programKey);
    assert.equal(target.searchParams.has("userId"), false);
    assert.equal(new Headers(init?.headers).get("Cookie"), "session=test-only");
    assert.equal(new Headers(init?.headers).get("X-Request-Id"), "context-test");
    return response(context(), init);
  } });
  const request = { ...selection, authenticatedUserId: owner, requestId: "context-test", sessionHeaders: { Cookie: "session=test-only" } };
  const first = await load(request);
  assert.equal(first.status, 200);
  assert.ok(first.memory);
  const changed = applyConditionChanges(first.memory, owner, { id: "t1", text: "가입했어" },
    [{ slotId: first.bindings[0].slotId, status: "known", value: true, quote: "가입했어" }]);
  const before = structuredClone(changed);
  const next = await load(request, changed);
  assert.ok(next.memory);
  assert.equal(readConditionFact(next.memory, next.bindings[0].slotId).value, true);
  assert.equal(next.memory.slots[0].initial?.value, false);
  assert.deepEqual(changed, before);
});

test("errors and invalid responses do not replace existing memory; wrong owner never fetches", async () => {
  const previous = projectUserConditionContext(context(), owner, selection).memory;
  const before = structuredClone(previous);
  let calls = 0;
  const load = createUserConditionLoader({ baseUrl: "http://spring:8080", fetch: async (_url, init) => {
    calls++;
    return response(null, init, 404);
  } });
  const request = { ...selection, authenticatedUserId: owner };
  const failed = await load(request, previous);
  assert.equal(failed.status, 404);
  assert.equal(failed.memory, null);
  assert.deepEqual(previous, before);
  await assert.rejects(() => load({ ...request, authenticatedUserId: "other" }, previous), /OWNER_MISMATCH/);
  assert.equal(calls, 1);
  const invalid = createUserConditionLoader({ baseUrl: "http://spring:8080", fetch: async (_url, init) =>
    response({ ...context(), userId: "other" }, init) });
  assert.equal((await invalid(request)).body.error?.code, "BACKEND_INVALID_RESPONSE");
});
