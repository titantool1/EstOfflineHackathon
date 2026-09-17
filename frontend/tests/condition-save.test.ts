import assert from "node:assert/strict";
import { test } from "node:test";
import { applyConditionChanges, conditionSlotId, createConditionMemory } from
  "../src/lib/server/ai/application/condition-memory.ts";
import type { ConditionInput, ConditionMemory } from "../src/lib/server/ai/application/condition-memory.ts";
import { ConditionSaveError, createConditionSaveService } from
  "../src/lib/server/ai/application/condition-save.ts";
import type { ConditionSavePort, ConditionSaveRequest } from
  "../src/lib/server/ai/application/condition-save.ts";

const owner = "synthetic-owner-A";
const observed = (hour: number) => `2026-09-17T0${hour}:00:00Z`;
const membership = (service: string, scope: ConditionInput["scope"] = { kind: "user" }): ConditionInput => ({
  inputKey: "membership.is_member", selector: { service_code: service }, target: { kind: "self", id: owner },
  scope, valueType: "boolean",
});
const eco = membership("eco");
const carbon = membership("carbon");
const evidence = [{ observedAt: "2026-09-01T00:00:00Z", sourceKind: "user_statement" as const }];

function changed(memory: ConditionMemory, input: ConditionInput, turnId: string,
  status: "known" | "unknown" | "refused", value: boolean | null) {
  const text = status === "known" ? `${input.selector.service_code} ${String(value)}` : `${input.selector.service_code} ${status}`;
  const change = status === "known"
    ? { slotId: conditionSlotId(input), status, value: value as boolean, quote: text }
    : { slotId: conditionSlotId(input), status, value: null, quote: text };
  return applyConditionChanges(memory, owner, { id: turnId, text }, [change]);
}

function recordingPort(results: Array<"saved" | "rejected" | "outcome_unconfirmed"> = ["saved"]) {
  const requests: ConditionSaveRequest[] = [];
  const port: ConditionSavePort = { async save(request) {
    requests.push(structuredClone(request));
    return { status: results.shift() ?? "saved" };
  } };
  return { port, requests };
}

test("initial DB values are not changes and an empty save does not call the port", async () => {
  const memory = createConditionMemory(owner, [{ input: eco, stored: { value: false, evidence } }]);
  const recorded = recordingPort();
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recorded.port });
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });
  assert.deepEqual(await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" }),
    { status: "no_changes", attemptId: "attempt-1" });
  assert.equal(recorded.requests.length, 0);
});

test("successful turns keep per-change observations, known false, baselines and caller isolation", async () => {
  let memory = createConditionMemory(owner, [
    { input: eco, stored: { value: true, evidence } }, { input: carbon, stored: null },
  ]);
  const recorded = recordingPort();
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recorded.port });
  memory = changed(memory, eco, "turn-1", "known", false);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });
  memory = changed(memory, carbon, "turn-2", "known", true);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2", observedAt: observed(2), memory });
  memory.slots[0].change!.value = true;

  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" })).status, "saved");
  assert.equal(recorded.requests.length, 1);
  const bySlot = new Map(recorded.requests[0].changes.map(change => [change.slotId, change]));
  assert.deepEqual(bySlot.get(conditionSlotId(eco))?.operation, { kind: "set", value: false });
  assert.deepEqual(bySlot.get(conditionSlotId(eco))?.baseline, { status: "known", value: true });
  assert.equal(bySlot.get(conditionSlotId(eco))?.observation.observedAt, observed(1));
  assert.equal(bySlot.get(conditionSlotId(carbon))?.observation.observedAt, observed(2));
});

test("unknown or refused blocks the whole save until the current turn intent is classified", async () => {
  let memory = createConditionMemory(owner, [
    { input: eco, stored: { value: false, evidence } }, { input: carbon, stored: null },
  ]);
  const recorded = recordingPort();
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recorded.port });
  memory = changed(memory, eco, "turn-1", "known", true);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });
  memory = changed(memory, eco, "turn-2", "refused", null);
  assert.deepEqual(service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2",
    observedAt: observed(2), memory }), { status: "accepted", pendingChanges: 1, unresolvedIntents: 1 });
  memory = changed(memory, carbon, "turn-3", "known", true);
  assert.deepEqual(service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-3",
    observedAt: observed(3), memory }), { status: "accepted", pendingChanges: 2, unresolvedIntents: 1 });
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" })).status,
    "pending_resolution");
  assert.equal(recorded.requests.length, 0);

  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2", observedAt: observed(2), memory,
    persistenceIntents: [{ slotId: conditionSlotId(eco), turnId: "turn-2", disposition: "retain_saved_fact" }] });
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" })).status, "saved");
  assert.equal(recorded.requests.length, 1);
  assert.equal(recorded.requests[0].changes.length, 1);
  assert.equal(recorded.requests[0].changes[0].slotId, conditionSlotId(carbon));
  assert.deepEqual(recorded.requests[0].changes[0].operation, { kind: "set", value: true });
  assert.deepEqual(recorded.requests[0].changes[0].observation,
    { observedAt: observed(3), sourceKind: "user_statement", turnId: "turn-3" });
  assert.deepEqual(recorded.requests[0].changes[0].baseline, { status: "missing" });
});

test("explicit current-turn clear is replaced by a later known correction and stale intent is rejected", async () => {
  let memory = createConditionMemory(owner, [{ input: eco, stored: { value: true, evidence } }]);
  const recorded = recordingPort();
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recorded.port });
  memory = changed(memory, eco, "turn-1", "unknown", null);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory,
    persistenceIntents: [{ slotId: conditionSlotId(eco), turnId: "turn-1", disposition: "clear_saved_fact" }] });
  memory = changed(memory, eco, "turn-2", "known", false);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2", observedAt: observed(2), memory });
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1",
    observedAt: observed(1), memory: changed(memory, eco, "turn-1", "unknown", null),
    persistenceIntents: [{ slotId: conditionSlotId(eco), turnId: "turn-1", disposition: "clear_saved_fact" }] }),
  (error: unknown) => error instanceof ConditionSaveError && error.code === "STALE_CONDITION_SAVE_TURN");

  await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" });
  assert.deepEqual(recorded.requests[0].changes[0].operation, { kind: "set", value: false });
  assert.deepEqual(recorded.requests[0].changes[0].observation,
    { observedAt: observed(2), sourceKind: "user_statement", turnId: "turn-2" });
  assert.deepEqual(recorded.requests[0].changes[0].baseline, { status: "known", value: true });

  const clearPort = recordingPort();
  const clearService = createConditionSaveService({ conversationId: "conversation-clear", ownerId: owner,
    port: clearPort.port });
  const clearMemory = changed(createConditionMemory(owner, [{ input: eco, stored: { value: true, evidence } }]),
    eco, "turn-clear", "unknown", null);
  assert.deepEqual(clearService.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-clear",
    observedAt: observed(3), memory: clearMemory }),
  { status: "accepted", pendingChanges: 0, unresolvedIntents: 1 });
  clearService.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-clear", observedAt: observed(3),
    memory: clearMemory, persistenceIntents: [{ slotId: conditionSlotId(eco), turnId: "turn-clear",
      disposition: "clear_saved_fact" }] });
  assert.equal((await clearService.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-clear" })).status, "saved");
  assert.deepEqual(clearPort.requests[0].changes[0].operation, { kind: "clear" });
  assert.deepEqual(clearPort.requests[0].changes[0].observation,
    { observedAt: observed(3), sourceKind: "user_statement", turnId: "turn-clear" });
  assert.deepEqual(clearPort.requests[0].changes[0].baseline, { status: "known", value: true });
});

test("scope, owner and stale or unrelated persistence intents are rejected atomically", () => {
  const benefit = membership("eco", { kind: "benefit", id: "benefit-1" });
  const benefitMemory = changed(createConditionMemory(owner, [{ input: benefit, stored: null }]), benefit,
    "turn-1", "known", true);
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recordingPort().port });
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1",
    observedAt: observed(1), memory: benefitMemory }), /UNSUPPORTED_CONDITION_SAVE_SCOPE/);
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: "other", turnId: "turn-1",
    observedAt: observed(1), memory: benefitMemory }), /CONDITION_SAVE_OWNER_MISMATCH/);

  const memory = changed(createConditionMemory(owner, [{ input: eco, stored: null }]), eco, "turn-2", "unknown", null);
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2", observedAt: observed(2), memory,
    persistenceIntents: [{ slotId: conditionSlotId(eco), turnId: "turn-old", disposition: "clear_saved_fact" }] }),
  /INVALID_PERSISTENCE_INTENT/);
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2", observedAt: observed(2), memory,
    persistenceIntents: [JSON.parse(JSON.stringify({ slotId: conditionSlotId(eco), turnId: "turn-2", disposition: "keep_maybe" }))] }),
  /INVALID_PERSISTENCE_INTENT/);
  assert.equal(service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2",
    observedAt: observed(2), memory }).unresolvedIntents, 1);
});

test("a frozen attempt is immutable, coalesces duplicate close, and retries the same payload safely", async () => {
  let release!: (status: "outcome_unconfirmed") => void;
  const first = new Promise<{ status: "outcome_unconfirmed" }>(resolve => { release = status => resolve({ status }); });
  const requests: Readonly<ConditionSaveRequest>[] = [];
  let calls = 0;
  const port: ConditionSavePort = { async save(request) {
    calls += 1; requests.push(request);
    assert.throws(() => { (request.changes[0].operation as { kind: string }).kind = "clear"; }, TypeError);
    if (calls === 1) return first;
    return { status: "saved" };
  } };
  let memory = createConditionMemory(owner, [{ input: eco, stored: null }]);
  memory = changed(memory, eco, "turn-1", "known", false);
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port });
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });

  const saving = service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" });
  const duplicate = service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" });
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2",
    observedAt: observed(2), memory }), /CONDITION_SAVE_ATTEMPT_FROZEN/);
  await assert.rejects(service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-other" }),
    /CONDITION_SAVE_ATTEMPT_FROZEN/);
  release("outcome_unconfirmed");
  assert.equal((await saving).status, "outcome_unconfirmed");
  assert.equal((await duplicate).status, "outcome_unconfirmed");
  assert.equal(calls, 1);
  assert.throws(() => service.releaseRejectedAttemptForCorrection({ authenticatedOwnerId: owner,
    rejectedAttemptId: "attempt-1" }), /CONDITION_SAVE_ATTEMPT_NOT_REJECTED/);

  const saved = await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" });
  assert.equal(saved.status, "saved");
  saved.attemptId = "caller-mutated";
  assert.equal(calls, 2);
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" }),
    { status: "saved", attemptId: "attempt-1" });
  assert.equal(calls, 2);
  assert.throws(() => service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-after-save",
    observedAt: observed(2), memory }), /CONDITION_SAVE_TERMINAL/);
});

test("construction captures identity and port, and a synchronous throw is retried", async () => {
  let calls = 0;
  const originalPort: ConditionSavePort = { save() {
    calls += 1;
    if (calls === 1) throw new Error("synchronous failure");
    return Promise.resolve({ status: "saved" });
  } };
  const replacement = recordingPort();
  const options = { conversationId: "conversation-fixed", ownerId: owner, port: originalPort };
  const service = createConditionSaveService(options);
  options.conversationId = "conversation-mutated";
  options.ownerId = "other";
  options.port = replacement.port;
  let memory = createConditionMemory(owner, [{ input: eco, stored: null }]);
  memory = changed(memory, eco, "turn-1", "known", true);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" })).status,
    "outcome_unconfirmed");
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" })).status, "saved");
  assert.equal(calls, 2);
  assert.equal(replacement.requests.length, 0);
});

test("only a confirmed rejection can be released for correction and it requires a new attempt", async () => {
  const recorded = recordingPort(["rejected", "saved"]);
  let memory = createConditionMemory(owner, [{ input: eco, stored: { value: false, evidence } }]);
  memory = changed(memory, eco, "turn-1", "known", true);
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recorded.port });
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-rejected" })).status,
    "rejected");
  assert.deepEqual(service.releaseRejectedAttemptForCorrection({ authenticatedOwnerId: owner,
    rejectedAttemptId: "attempt-rejected" }), { status: "correction_required" });
  await assert.rejects(service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-rejected" }),
    /CONDITION_SAVE_ATTEMPT_REPLACED/);

  memory = changed(memory, eco, "turn-2", "known", false);
  service.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-2", observedAt: observed(2), memory });
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-corrected" })).status, "saved");
  assert.equal(recorded.requests.length, 2);
  assert.equal(recorded.requests[1].attemptId, "attempt-corrected");
  assert.deepEqual(recorded.requests[1].changes[0].operation, { kind: "set", value: false });
});

test("a no_changes result is terminal except for the same completed attempt", async () => {
  const service = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: recordingPort().port });
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-empty" })).status, "no_changes");
  assert.equal((await service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-empty" })).status, "no_changes");
  await assert.rejects(service.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-new" }),
    /CONDITION_SAVE_TERMINAL/);
});

test("throwing ports expose only outcome_unconfirmed and conversations keep independent state", async () => {
  const secret = "private-fact-value";
  const broken: ConditionSavePort = { async save() { throw new Error(secret); } };
  let memory = createConditionMemory(owner, [{ input: eco, stored: null }]);
  memory = changed(memory, eco, "turn-1", "known", true);
  const first = createConditionSaveService({ conversationId: "conversation-1", ownerId: owner, port: broken });
  const secondPort = recordingPort();
  const second = createConditionSaveService({ conversationId: "conversation-2", ownerId: owner, port: secondPort.port });
  first.acceptSuccessfulTurn({ authenticatedOwnerId: owner, turnId: "turn-1", observedAt: observed(1), memory });
  const result = await first.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-1" });
  assert.deepEqual(result, { status: "outcome_unconfirmed", attemptId: "attempt-1" });
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal((await second.requestSave({ authenticatedOwnerId: owner, attemptId: "attempt-2" })).status, "no_changes");
  assert.equal(secondPort.requests.length, 0);
});
