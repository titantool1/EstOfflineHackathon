// Pure, JSON-serializable conversation state. No SDK, HTTP, DB, or policy decisions.
export type ConditionValue = string | number | boolean | string[];
export type ConditionTarget =
  | { kind: "self" | "household" | "home" | "vehicle"; id: string }
  | { kind: "member"; id: string; householdId: string };
export type ConditionInput = {
  inputKey: string;
  selector: Record<string, string>;
  target: ConditionTarget;
  scope: { kind: "user" } | { kind: "benefit" | "case"; id: string };
  valueType: "boolean" | "integer" | "number" | "text" | "date" | "region_id_array";
};
export type StoredCondition = {
  value: ConditionValue;
  // A region array can have one source record per region.
  evidence: { observedAt: string; sourceKind: "user_statement"; reference?: string }[];
};
type ConversationSource = { kind: "conversation"; turnId: string; quote: string };
export type ConditionFact = (
  | { status: "known"; value: ConditionValue }
  | { status: "unknown" | "refused"; value: null }
) & { source: ConversationSource | { kind: "database"; evidence: StoredCondition["evidence"] } };
export type ConditionSlot = {
  id: string;
  input: ConditionInput;
  initial: (ConditionFact & { status: "known" }) | null;
  change: (ConditionFact & { source: ConversationSource }) | null;
};
export type ConditionMemory = { userId: string; slots: ConditionSlot[] };
export type ConditionSeed = { input: ConditionInput; stored: StoredCondition | null };
export type ConditionChange = { slotId: string; quote: string } & (
  | { status: "known"; value: ConditionValue }
  | { status: "unknown" | "refused"; value: null }
);

const valueTypes = ["boolean", "integer", "number", "text", "date", "region_id_array"];
const nonempty = (value: string) => typeof value === "string" && value.trim().length > 0;

// Canonical identity: input key alone would mix services, family members, and purchases.
export function conditionSlotId(input: ConditionInput): string {
  return JSON.stringify([
    input.inputKey, Object.entries(input.selector).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
    input.target.kind, input.target.id, input.target.kind === "member" ? input.target.householdId : null,
    input.scope.kind, input.scope.kind === "user" ? null : input.scope.id,
  ]);
}

function validValue(input: ConditionInput, value: unknown): boolean {
  switch (input.valueType) {
    case "boolean": return typeof value === "boolean";
    case "integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "text": return typeof value === "string" && nonempty(value);
    case "date": return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    case "region_id_array": return Array.isArray(value) && value.every(v => typeof v === "string" && nonempty(v));
    default: return false;
  }
}

function checkOwner(memory: ConditionMemory, userId: string) {
  if (!nonempty(userId) || memory.userId !== userId) throw new Error("CONDITION_MEMORY_OWNER_MISMATCH");
}

export function createConditionMemory(userId: string, seeds: ConditionSeed[]): ConditionMemory {
  if (!nonempty(userId)) throw new Error("INVALID_CONDITION_USER");
  return addConditionInputs({ userId, slots: [] }, userId, seeds);
}

// Reopening a benefit adds its required inputs but never overwrites an existing correction.
// Refreshing DB snapshots is deliberately a separate, future operation.
export function addConditionInputs(memory: ConditionMemory, userId: string, seeds: ConditionSeed[]): ConditionMemory {
  checkOwner(memory, userId);
  const next = structuredClone(memory);
  const seen = new Set<string>();
  for (const { input, stored } of seeds) {
    if (!nonempty(input.inputKey) || !nonempty(input.target.id)
      || !["self", "household", "member", "home", "vehicle"].includes(input.target.kind)
      || (input.target.kind === "self" && input.target.id !== userId)
      || (input.target.kind === "member" && !nonempty(input.target.householdId))
      || !["user", "benefit", "case"].includes(input.scope.kind)
      || (input.scope.kind !== "user" && !nonempty(input.scope.id))
      || !valueTypes.includes(input.valueType)
      || Object.entries(input.selector).some(([key, value]) => !nonempty(key) || !nonempty(value))) {
      throw new Error("INVALID_CONDITION_INPUT");
    }
    const id = conditionSlotId(input);
    if (seen.has(id)) throw new Error("DUPLICATE_CONDITION_INPUT");
    seen.add(id);
    if (stored && (!validValue(input, stored.value) || !stored.evidence.length
      || stored.evidence.some(e => e.sourceKind !== "user_statement" || !nonempty(e.observedAt)
        || !Number.isFinite(Date.parse(e.observedAt))))) throw new Error("INVALID_STORED_CONDITION");
    const existing = next.slots.find(slot => slot.id === id);
    if (existing) {
      if (existing.input.valueType !== input.valueType) throw new Error("CONDITION_SCHEMA_CHANGED");
      continue;
    }
    next.slots.push({ id, input: structuredClone(input), change: null,
      initial: stored ? { status: "known", value: structuredClone(stored.value),
        source: { kind: "database", evidence: structuredClone(stored.evidence) } } : null });
  }
  return next;
}

// Caller supplies an actual user turn and validated model interpretation.
// Exact quotation proves text presence, not the semantic accuracy of that interpretation.
export function applyConditionChanges(memory: ConditionMemory, userId: string,
  turn: { id: string; text: string }, changes: ConditionChange[]): ConditionMemory {
  checkOwner(memory, userId);
  if (!nonempty(turn.id) || !nonempty(turn.text)) throw new Error("INVALID_CONDITION_TURN");
  const next = structuredClone(memory);
  const seen = new Set<string>();
  for (const change of changes) {
    const slot = next.slots.find(item => item.id === change.slotId);
    if (!slot || seen.has(change.slotId)) throw new Error("INVALID_CONDITION_SLOT");
    seen.add(change.slotId);
    if (!nonempty(change.quote) || !turn.text.includes(change.quote)) throw new Error("INVALID_CONDITION_EVIDENCE");
    if (change.status === "known" ? !validValue(slot.input, change.value)
      : !["unknown", "refused"].includes(change.status) || change.value !== null) {
      throw new Error("INVALID_CONDITION_VALUE");
    }
    const source: ConversationSource = { kind: "conversation", turnId: turn.id, quote: change.quote };
    slot.change = change.status === "known"
      ? { status: "known", value: structuredClone(change.value), source }
      : { status: change.status, value: null, source };
  }
  return next;
}

export function readConditionFact(memory: ConditionMemory, slotId: string): ConditionFact | { status: "missing"; value: null; source: null } {
  const slot = memory.slots.find(item => item.id === slotId);
  if (!slot) throw new Error("INVALID_CONDITION_SLOT");
  return structuredClone(slot.change ?? slot.initial ?? { status: "missing", value: null, source: null });
}

export function conditionView(memory: ConditionMemory) {
  return memory.slots.map(slot => ({ slotId: slot.id, input: structuredClone(slot.input), fact: readConditionFact(memory, slot.id) }));
}

// Starting another purchase removes only that case's temporary inputs.
export function clearConditionCase(memory: ConditionMemory, userId: string, caseId: string): ConditionMemory {
  checkOwner(memory, userId);
  return { userId, slots: structuredClone(memory.slots.filter(slot =>
    slot.input.scope.kind !== "case" || slot.input.scope.id !== caseId)) };
}
