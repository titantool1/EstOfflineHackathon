import "server-only";
import { createSpringClient } from "../../spring-client.ts";
import { addConditionInputs, conditionSlotId, createConditionMemory } from "../application/condition-memory.ts";
import type { ConditionInput, ConditionMemory, ConditionSeed, StoredCondition } from "../application/condition-memory.ts";

export type ConditionSelection = {
  programKey: string; actionId: string;
  householdId?: string; homeId?: string; vehicleId?: string;
};
type Binding = { slotId: string; conditionIds: string[] };
export type UserConditionContext = {
  userId: string; programKey: string; actionId: string; eligibilityStatus: "not_evaluated";
  inputs: { inputKey: string; selector: Record<string, string>; target: {
    kind: "self" | "member" | "home" | "vehicle"; id: string; householdId: string | null;
  }; valueType: ConditionInput["valueType"]; conditionIds: string[]; fact: { value: StoredCondition["value"]; evidence: { observedAt: string; sourceKind: "user_statement"; reference?: string | null }[] } | null }[];
  unselectedInputs: { inputKey: string; selector: Record<string, string>; targetKind: "household" | "home" | "vehicle"; conditionIds: string[] }[];
  unmappedConditionIds: string[];
  households: { id: string; membersComplete: boolean; members: {
    id: string; relationToApplicant: string; onResidentRegister: boolean | null;
  }[] }[];
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);
const selector = (value: unknown) => object(value) && Object.entries(value).every(([key, item]) => nonempty(key) && nonempty(item));
const types = ["boolean", "integer", "number", "text", "date", "region_id_array"];

function isContext(value: unknown, owner: string, selection: ConditionSelection): value is UserConditionContext {
  if (!object(value) || value.userId !== owner || value.programKey !== selection.programKey
    || value.actionId !== selection.actionId || value.eligibilityStatus !== "not_evaluated"
    || !Array.isArray(value.inputs) || !Array.isArray(value.unselectedInputs)
    || !strings(value.unmappedConditionIds) || !Array.isArray(value.households)) return false;
  for (const household of value.households) {
    if (!object(household) || household.id !== selection.householdId || typeof household.membersComplete !== "boolean"
      || !Array.isArray(household.members) || household.members.some(member => !object(member) || !nonempty(member.id)
        || !nonempty(member.relationToApplicant) || !(member.onResidentRegister === null || typeof member.onResidentRegister === "boolean"))) return false;
  }
  for (const input of value.unselectedInputs) {
    if (!object(input) || !nonempty(input.inputKey) || !selector(input.selector) || !strings(input.conditionIds)
      || !["household", "home", "vehicle"].includes(String(input.targetKind))) return false;
    if (input.targetKind === "household" ? selection.householdId : input.targetKind === "home" ? selection.homeId : selection.vehicleId) return false;
  }
  for (const input of value.inputs) {
    if (!object(input) || !nonempty(input.inputKey) || !selector(input.selector) || !strings(input.conditionIds)
      || !types.includes(String(input.valueType)) || !object(input.target) || !nonempty(input.target.id)) return false;
    const target = input.target;
    if (target.kind === "self") {
      if (target.id !== owner || target.householdId !== null) return false;
    } else if (target.kind === "member") {
      if (!selection.householdId || target.householdId !== selection.householdId
        || !value.households.some(h => object(h) && h.id === target.householdId && Array.isArray(h.members)
          && h.members.some(m => object(m) && m.id === target.id))) return false;
    } else if (target.kind === "home" || target.kind === "vehicle") {
      if (target.id !== (target.kind === "home" ? selection.homeId : selection.vehicleId) || target.householdId !== null) return false;
    } else return false;
    if (input.fact !== null && (!object(input.fact) || !("value" in input.fact) || !Array.isArray(input.fact.evidence)
      || !input.fact.evidence.length || input.fact.evidence.some(e => !object(e) || !nonempty(e.observedAt)
        || e.sourceKind !== "user_statement" || !(e.reference === null || e.reference === undefined || nonempty(e.reference))))) return false;
  }
  return true;
}

export function projectUserConditionContext(value: unknown, owner: string, selection: ConditionSelection) {
  if (!isContext(value, owner, selection)) throw new Error("INVALID_USER_CONDITION_CONTEXT");
  const seeds = new Map<string, ConditionSeed>();
  const bindings: Binding[] = [];
  for (const item of value.inputs) {
    const target: ConditionInput["target"] = item.target.kind === "member"
      ? { kind: "member", id: item.target.id, householdId: item.target.householdId! }
      : { kind: item.target.kind, id: item.target.id };
    const input: ConditionInput = { inputKey: item.inputKey, selector: item.selector, target,
      scope: { kind: "user" }, valueType: item.valueType };
    const stored: StoredCondition | null = item.fact === null ? null : {
      value: item.fact.value,
      evidence: item.fact.evidence.map(e => ({ observedAt: e.observedAt, sourceKind: e.sourceKind,
        ...(e.reference ? { reference: e.reference } : {}) })),
    };
    const slotId = conditionSlotId(input), previous = seeds.get(slotId);
    if (previous && (previous.input.valueType !== input.valueType || JSON.stringify(previous.stored) !== JSON.stringify(stored))) {
      throw new Error("CONFLICTING_USER_CONDITION_FACTS");
    }
    seeds.set(slotId, { input, stored });
    bindings.push({ slotId, conditionIds: [...item.conditionIds] });
  }
  // Reuse the memory module's value/date/source checks, without accepting unknown JSON as facts.
  const memory = createConditionMemory(owner, [...seeds.values()]);
  return { context: structuredClone(value), seeds: [...seeds.values()], bindings, memory };
}

export function createUserConditionLoader(config: Parameters<typeof createSpringClient>[0]) {
  const spring = createSpringClient(config);
  return async (request: ConditionSelection & {
    authenticatedUserId: string; requestId?: string | null; signal?: AbortSignal;
    // Selected credentials from the server's authenticated session; never a user-ID override.
    sessionHeaders?: HeadersInit;
  }, previous?: ConditionMemory) => {
    if (previous && previous.userId !== request.authenticatedUserId) throw new Error("CONDITION_MEMORY_OWNER_MISMATCH");
    const result = await spring.request<UserConditionContext>("/api/profile/condition-context", {
      requestId: request.requestId, signal: request.signal, headers: request.sessionHeaders,
      query: { programKey: request.programKey, actionId: request.actionId, householdId: request.householdId,
        homeId: request.homeId, vehicleId: request.vehicleId },
      validate: (value): value is UserConditionContext => {
        try { projectUserConditionContext(value, request.authenticatedUserId, request); return true; }
        catch { return false; }
      },
    });
    if (result.body.error || !result.body.data) return { ...result, memory: null, bindings: [] as Binding[] };
    const projection = projectUserConditionContext(result.body.data, request.authenticatedUserId, request);
    return { ...result, memory: previous ? addConditionInputs(previous, request.authenticatedUserId, projection.seeds) : projection.memory,
      bindings: projection.bindings };
  };
}

// Load catalog-supported self facts once per conversation, without model-selected search IDs.
export function createConversationConditionLoader(config: Parameters<typeof createSpringClient>[0]) {
 const spring = createSpringClient(config), selection = { programKey: 'conversation', actionId: 'conversation' };
 return async (request: { authenticatedUserId: string; requestId?: string; sessionHeaders?: HeadersInit }, previous: ConditionMemory, signal: AbortSignal) => {
  if (previous.userId !== request.authenticatedUserId) throw new Error('CONDITION_MEMORY_OWNER_MISMATCH');
  const result = await spring.request<UserConditionContext>('/api/profile/conversation-context', {
   requestId: request.requestId, headers: request.sessionHeaders, signal,
   validate: (value): value is UserConditionContext => {
    try { const out = projectUserConditionContext(value, request.authenticatedUserId, selection);
     return out.seeds.every(s => s.input.target.kind === 'self'); } catch { return false; }
   },
  });
  if (result.body.error || !result.body.data) throw new Error(result.body.error?.code ?? 'CONDITION_CONTEXT_UNAVAILABLE');
  const projection = projectUserConditionContext(result.body.data, request.authenticatedUserId, selection);
  return addConditionInputs(previous, request.authenticatedUserId, projection.seeds);
 };
}
