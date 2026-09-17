import "server-only";
import type { ConditionInput, ConditionMemory, ConditionValue } from "./condition-memory.ts";

export type ConditionPersistenceIntent = {
  slotId: string;
  turnId: string;
  disposition: "clear_saved_fact" | "retain_saved_fact";
};

export type ConditionSaveChange = {
  slotId: string;
  input: ConditionInput;
  operation: { kind: "set"; value: ConditionValue } | { kind: "clear" };
  observation: { observedAt: string; sourceKind: "user_statement"; turnId: string };
  baseline: { status: "missing" } | { status: "known"; value: ConditionValue };
};

export type ConditionSaveRequest = {
  conversationId: string;
  ownerId: string;
  attemptId: string;
  changes: readonly ConditionSaveChange[];
};

export type ConditionSavePort = {
  save(request: Readonly<ConditionSaveRequest>): Promise<{ status: "saved" | "rejected" | "outcome_unconfirmed" }>;
};

export type ConditionSaveOutcome = {
  status: "saved" | "no_changes" | "pending_resolution" | "rejected" | "outcome_unconfirmed";
  attemptId: string;
};

export class ConditionSaveError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ConditionSaveError";
    this.code = code;
  }
}

type TurnRecord = { observedAt: string; snapshot: string; finalized: boolean };
type PendingChange = ConditionSaveChange & { turnId: string };
type FrozenAttempt = { id: string; request: ConditionSaveRequest; promise: Promise<ConditionSaveOutcome> | null;
  lastStatus: "rejected" | "outcome_unconfirmed" | null };

const nonempty = (value: string) => typeof value === "string" && value.trim().length > 0;
const fail = (code: string): never => { throw new ConditionSaveError(code); };

function validObservedAt(value: string) {
  return nonempty(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function turnSnapshot(memory: ConditionMemory, turnId: string) {
  return JSON.stringify(memory.slots
    .filter(slot => slot.change?.source.turnId === turnId)
    .map(slot => ({ id: slot.id, input: slot.input, initial: slot.initial, change: slot.change }))
    .sort((a, b) => a.id.localeCompare(b.id)));
}

function baselineFor(slot: ConditionMemory["slots"][number]): ConditionSaveChange["baseline"] {
  return slot.initial
    ? { status: "known", value: structuredClone(slot.initial.value) }
    : { status: "missing" };
}

export function createConditionSaveService(options: {
  conversationId: string;
  ownerId: string;
  port: ConditionSavePort;
}) {
  if (!nonempty(options.conversationId) || !nonempty(options.ownerId)) fail("INVALID_CONDITION_SAVE_CONTEXT");
  const conversationId = options.conversationId;
  const ownerId = options.ownerId;
  const port = options.port;
  const pending = new Map<string, PendingChange>();
  const unresolved = new Map<string, string>();
  const latestTurnBySlot = new Map<string, string>();
  const turns = new Map<string, TurnRecord>();
  const completed = new Map<string, ConditionSaveOutcome>();
  const replacedAttempts = new Set<string>();
  let frozen: FrozenAttempt | null = null;
  let terminal = false;

  function checkOwner(authenticatedOwnerId: string, memory?: ConditionMemory) {
    if (authenticatedOwnerId !== ownerId || (memory && memory.userId !== ownerId)) {
      fail("CONDITION_SAVE_OWNER_MISMATCH");
    }
  }

  function acceptSuccessfulTurn(input: {
    authenticatedOwnerId: string;
    turnId: string;
    observedAt: string;
    memory: ConditionMemory;
    persistenceIntents?: ConditionPersistenceIntent[];
  }): { status: "accepted"; pendingChanges: number; unresolvedIntents: number } {
    checkOwner(input.authenticatedOwnerId, input.memory);
    if (terminal) fail("CONDITION_SAVE_TERMINAL");
    if (frozen) fail("CONDITION_SAVE_ATTEMPT_FROZEN");
    if (!nonempty(input.turnId) || !validObservedAt(input.observedAt)) fail("INVALID_SUCCESSFUL_TURN");

    const currentSlots = input.memory.slots.filter(slot => slot.change?.source.turnId === input.turnId);
    const snapshot = turnSnapshot(input.memory, input.turnId);
    const priorTurn = turns.get(input.turnId);
    if (priorTurn?.finalized) fail("CONDITION_SAVE_TURN_FINALIZED");
    if (priorTurn && (priorTurn.observedAt !== input.observedAt || priorTurn.snapshot !== snapshot)) {
      fail("CONDITION_SAVE_TURN_REPLAY_MISMATCH");
    }

    const intents = input.persistenceIntents ?? [];
    const intentBySlot = new Map<string, ConditionPersistenceIntent>();
    for (const intent of intents) {
      if (intent.turnId !== input.turnId || intentBySlot.has(intent.slotId)
        || !["clear_saved_fact", "retain_saved_fact"].includes(intent.disposition)) fail("INVALID_PERSISTENCE_INTENT");
      const slot = currentSlots.find(candidate => candidate.id === intent.slotId);
      if (!slot?.change || slot.change.status === "known") fail("INVALID_PERSISTENCE_INTENT");
      intentBySlot.set(intent.slotId, intent);
    }

    for (const slot of currentSlots) {
      if (slot.input.scope.kind !== "user") fail("UNSUPPORTED_CONDITION_SAVE_SCOPE");
      if (slot.input.target.kind === "self" && slot.input.target.id !== ownerId) {
        fail("CONDITION_SAVE_OWNER_MISMATCH");
      }
      const latestTurn = latestTurnBySlot.get(slot.id);
      if (latestTurn && latestTurn !== input.turnId && priorTurn) fail("STALE_CONDITION_SAVE_TURN");
    }

    // Validate the whole snapshot before changing service state.
    const nextPending = new Map(pending);
    const nextUnresolved = new Map(unresolved);
    const nextLatest = new Map(latestTurnBySlot);
    for (const slot of currentSlots) {
      const change = slot.change!;
      nextLatest.set(slot.id, input.turnId);
      const observation = { observedAt: input.observedAt, sourceKind: "user_statement" as const, turnId: input.turnId };
      if (change.status === "known") {
        nextPending.set(slot.id, { slotId: slot.id, input: structuredClone(slot.input),
          operation: { kind: "set", value: structuredClone(change.value) }, observation,
          baseline: baselineFor(slot), turnId: input.turnId });
        nextUnresolved.delete(slot.id);
        continue;
      }
      const intent = intentBySlot.get(slot.id);
      if (!intent) {
        nextUnresolved.set(slot.id, input.turnId);
      } else if (intent.disposition === "clear_saved_fact") {
        nextPending.set(slot.id, { slotId: slot.id, input: structuredClone(slot.input),
          operation: { kind: "clear" }, observation, baseline: baselineFor(slot), turnId: input.turnId });
        nextUnresolved.delete(slot.id);
      } else {
        nextPending.delete(slot.id);
        nextUnresolved.delete(slot.id);
      }
    }

    pending.clear(); for (const [key, value] of nextPending) pending.set(key, value);
    unresolved.clear(); for (const [key, value] of nextUnresolved) unresolved.set(key, value);
    latestTurnBySlot.clear(); for (const [key, value] of nextLatest) latestTurnBySlot.set(key, value);
    turns.set(input.turnId, priorTurn ?? { observedAt: input.observedAt, snapshot, finalized: false });
    return { status: "accepted", pendingChanges: pending.size, unresolvedIntents: unresolved.size };
  }

  function finalizeAcceptedTurns() {
    for (const record of turns.values()) record.finalized = true;
  }

  async function requestSave(input: {
    authenticatedOwnerId: string;
    attemptId: string;
  }): Promise<ConditionSaveOutcome> {
    checkOwner(input.authenticatedOwnerId);
    if (!nonempty(input.attemptId)) fail("INVALID_CONDITION_SAVE_ATTEMPT");
    const done = completed.get(input.attemptId);
    if (done) return structuredClone(done);
    if (replacedAttempts.has(input.attemptId)) fail("CONDITION_SAVE_ATTEMPT_REPLACED");
    if (terminal) fail("CONDITION_SAVE_TERMINAL");
    if (unresolved.size) return { status: "pending_resolution", attemptId: input.attemptId };

    if (!frozen) {
      if (!pending.size) {
        const outcome = { status: "no_changes" as const, attemptId: input.attemptId };
        completed.set(input.attemptId, outcome);
        finalizeAcceptedTurns();
        terminal = true;
        return structuredClone(outcome);
      }
      const changes = [...pending.values()]
        .sort((a, b) => a.slotId.localeCompare(b.slotId))
        .map(change => structuredClone({ slotId: change.slotId, input: change.input, operation: change.operation,
          observation: change.observation, baseline: change.baseline }));
      frozen = { id: input.attemptId, request: deepFreeze({ conversationId,
        ownerId, attemptId: input.attemptId, changes }), promise: null, lastStatus: null };
    } else if (frozen.id !== input.attemptId) {
      fail("CONDITION_SAVE_ATTEMPT_FROZEN");
    }
    if (frozen.promise) return structuredClone(await frozen.promise);

    const active = frozen;
    const run = Promise.resolve().then(async (): Promise<ConditionSaveOutcome> => {
      let status: ConditionSaveOutcome["status"];
      try {
        const result = await port.save(active.request);
        switch (result?.status) {
          case "saved": case "rejected": case "outcome_unconfirmed": status = result.status; break;
          default: status = "outcome_unconfirmed";
        }
      } catch {
        status = "outcome_unconfirmed";
      }
      const outcome = { status, attemptId: active.id };
      if (status === "saved") {
        completed.set(active.id, outcome);
        pending.clear();
        finalizeAcceptedTurns();
        terminal = true;
        frozen = null;
      } else {
        active.lastStatus = status;
        active.promise = null;
      }
      return outcome;
    });
    active.promise = run;
    return structuredClone(await run);
  }

  function releaseRejectedAttemptForCorrection(input: {
    authenticatedOwnerId: string;
    rejectedAttemptId: string;
  }): { status: "correction_required" } {
    checkOwner(input.authenticatedOwnerId);
    const rejected = frozen;
    if (!rejected) throw new ConditionSaveError("CONDITION_SAVE_ATTEMPT_NOT_REJECTED");
    if (rejected.id !== input.rejectedAttemptId || rejected.promise
      || rejected.lastStatus !== "rejected") fail("CONDITION_SAVE_ATTEMPT_NOT_REJECTED");
    replacedAttempts.add(rejected.id);
    frozen = null;
    return { status: "correction_required" };
  }

  return { acceptSuccessfulTurn, requestSave, releaseRejectedAttemptForCorrection };
}
