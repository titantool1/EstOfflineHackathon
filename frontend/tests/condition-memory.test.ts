import assert from "node:assert/strict";
import { test } from "node:test";
import { addConditionInputs, applyConditionChanges, clearConditionCase, conditionSlotId,
  createConditionMemory, readConditionFact } from "../src/lib/server/ai/application/condition-memory.ts";
import type { ConditionChange, ConditionInput, ConditionMemory, ConditionSeed } from "../src/lib/server/ai/application/condition-memory.ts";

const user = "synthetic-user-A";
const evidence = [{ observedAt: "2026-09-17T00:00:00Z", sourceKind: "user_statement" as const }];
const membership = (service: string): ConditionInput => ({ inputKey: "membership.is_member",
  selector: { service_code: service }, target: { kind: "self", id: user }, scope: { kind: "user" }, valueType: "boolean" });
const input = membership("eco_mileage");
const seed: ConditionSeed = { input, stored: { value: false, evidence } };
const read = (memory: ConditionMemory, definition: ConditionInput = input) => readConditionFact(memory, conditionSlotId(definition));
const patch = (definition: ConditionInput, status: "known", value: boolean | number, quote: string): ConditionChange =>
  ({ slotId: conditionSlotId(definition), status, value, quote });

test("DB false, missing, provenance and JSON round-trip remain distinct; seed cannot mutate memory", () => {
  const missing = membership("carbon_green");
  const memory = createConditionMemory(user, [seed, { input: missing, stored: null }]);
  assert.deepEqual(read(memory), { status: "known", value: false, source: { kind: "database", evidence } });
  assert.deepEqual(read(memory, missing), { status: "missing", value: null, source: null });
  assert.deepEqual(JSON.parse(JSON.stringify(memory)), memory);
  memory.slots[0].initial!.value = true;
  assert.equal(seed.stored!.value, false);
  assert.throws(() => createConditionMemory("another-user", [seed]), /INVALID_CONDITION_INPUT/);
});

test("correction overlays DB, reopening does not erase it, and returned snapshots are independent", () => {
  const original = createConditionMemory(user, [seed]);
  const next = applyConditionChanges(original, user, { id: "turn-1", text: "이제 가입했어" },
    [patch(input, "known", true, "가입했어")]);
  assert.equal(read(original).value, false);
  assert.equal(next.slots[0].initial!.value, false);
  const reopened = addConditionInputs(next, user, [seed]);
  assert.equal(read(reopened).value, true);
  assert.deepEqual(read(reopened).source, { kind: "conversation", turnId: "turn-1", quote: "가입했어" });
  const detached = read(reopened); detached.value = false;
  assert.equal(read(reopened).value, true);
  assert.deepEqual(applyConditionChanges(reopened, user, { id: "turn-2", text: "다른 혜택도 설명해줘" }, []), reopened);
});

test("explicit unknown/refused hide stored facts; an omitted field preserves the last state", () => {
  let memory = createConditionMemory(user, [seed]);
  for (const [status, text] of [["unknown", "가입했는지 모르겠어"], ["refused", "가입 여부는 말 안 할래"]] as const) {
    memory = applyConditionChanges(memory, user, { id: status, text },
      [{ slotId: conditionSlotId(input), status, value: null, quote: text }]);
    assert.equal(read(memory).status, status);
    assert.equal(read(memory).value, null);
    assert.equal(memory.slots[0].initial!.value, false);
  }
  const next = applyConditionChanges(memory, user, { id: "correction", text: "확인했어. 미가입이야" },
    [patch(input, "known", false, "미가입이야")]);
  assert.equal(read(next).status, "known"); assert.equal(read(next).value, false);
});

test("services, members, households and homes have distinct input identities", () => {
  const member: ConditionInput = { inputKey: "member.registered_disability", selector: {},
    target: { kind: "member", householdId: "household-1", id: "member-1" }, scope: { kind: "user" }, valueType: "boolean" };
  const definitions: ConditionInput[] = [input, membership("carbon_green"), member,
    { ...member, target: { kind: "member", householdId: "household-1", id: "member-2" } },
    { ...member, target: { kind: "member", householdId: "household-2", id: "member-1" } },
    { ...member, inputKey: "home.dwelling_type", target: { kind: "home", id: "home-1" }, valueType: "text" },
    { ...member, inputKey: "home.dwelling_type", target: { kind: "home", id: "home-2" }, valueType: "text" }];
  const before = createConditionMemory(user, definitions.map(input => ({ input, stored: null })));
  const after = applyConditionChanges(before, user, { id: "t", text: "첫째는 등록됐어" }, [patch(member, "known", true, "첫째는 등록됐어")]);
  assert.equal(after.slots.filter(s => readConditionFact(after, s.id).status === "known").length, 1);
  assert.equal(read(after, definitions[3]).status, "missing");
  const a = { ...input, selector: { a: "1", b: "2" } }, b = { ...input, selector: { b: "2", a: "1" } };
  assert.equal(conditionSlotId(a), conditionSlotId(b));
});

test("new purchase clears only its case; shared, benefit and another case survive", () => {
  const amount: ConditionInput = { inputKey: "purchase.amount", selector: {}, target: input.target,
    scope: { kind: "case", id: "purchase-1" }, valueType: "number" };
  const another = { ...amount, scope: { kind: "case" as const, id: "purchase-2" } };
  const benefit = { ...input, scope: { kind: "benefit" as const, id: "benefit-1" } };
  const before = createConditionMemory(user, [seed, { input: amount, stored: null },
    { input: another, stored: null }, { input: benefit, stored: null }]);
  const changed = applyConditionChanges(before, user, { id: "t", text: "첫 구매 3000원" }, [patch(amount, "known", 3000, "3000원")]);
  const cleared = clearConditionCase(changed, user, "purchase-1");
  assert.equal(cleared.slots.length, 3);
  assert.equal(read(cleared).value, false);
  assert.equal(read(cleared, another).status, "missing");
  assert.equal(read(cleared, benefit).status, "missing");
  assert.equal(read(changed, amount).value, 3000);
  assert.equal(read(addConditionInputs(cleared, user, [{ input: amount, stored: null }]), amount).status, "missing");
});

test("invalid update batches, evidence, types and owner do not mutate memory", () => {
  const memory = createConditionMemory(user, [seed]), snapshot = structuredClone(memory);
  const valid = patch(input, "known", true, "가입했어"), turn = { id: "t", text: "가입했어" };
  for (const changes of [[valid, { ...valid, slotId: "unregistered" }], [valid, valid],
    [{ ...valid, quote: "이전 턴에서만 한 말" }], [patch(input, "known", 1, "가입했어")],
    // Invalid model JSON must also be rejected at runtime, despite the static contract.
    [JSON.parse(JSON.stringify({ ...valid, value: null }))],
    [JSON.parse(JSON.stringify({ ...valid, status: "unknown", value: false }))]]) {
    assert.throws(() => applyConditionChanges(memory, user, turn, changes));
    assert.deepEqual(memory, snapshot);
  }
  assert.throws(() => applyConditionChanges(memory, "other-user", turn, [valid]), /OWNER_MISMATCH/);
  assert.throws(() => addConditionInputs(memory, "other-user", []), /OWNER_MISMATCH/);
  assert.throws(() => clearConditionCase(memory, "other-user", "c"), /OWNER_MISMATCH/);
  assert.throws(() => addConditionInputs(memory, user, [seed, seed]), /DUPLICATE/);
  assert.throws(() => addConditionInputs(memory, user, [{ input: { ...input, valueType: "integer" }, stored: null }]), /SCHEMA_CHANGED/);
  assert.deepEqual(memory, snapshot);
});

test("DB-compatible dates, integer and region arrays retain values and multiple source records", () => {
  const birthday = { ...input, inputKey: "person.birth_date", selector: {}, valueType: "date" as const };
  const regions = { ...input, inputKey: "location.region_ids", selector: { relation: "work" }, valueType: "region_id_array" as const };
  const seats = { ...input, inputKey: "vehicle.seating_capacity", target: { kind: "vehicle" as const, id: "vehicle-1" }, valueType: "integer" as const };
  const memory = createConditionMemory(user, [
    { input: birthday, stored: { value: "2000-02-29", evidence } },
    { input: regions, stored: { value: ["test:region-A", "test:region-B"], evidence: [
      { ...evidence[0], reference: "test:region-A" }, { ...evidence[0], reference: "test:region-B" }] } },
    { input: seats, stored: { value: 5, evidence } },
  ]);
  assert.equal(read(memory, birthday).value, "2000-02-29");
  const fact = read(memory, regions);
  assert.deepEqual(fact.value, ["test:region-A", "test:region-B"]);
  assert.equal(fact.source?.kind, "database");
  if (fact.source?.kind === "database") assert.equal(fact.source.evidence.length, 2);
  for (const [input, value] of [[birthday, "2026-02-30"], [seats, 1.5]] as const) {
    assert.throws(() => createConditionMemory(user, [{ input, stored: { value, evidence } }]), /INVALID_STORED/);
  }
});
