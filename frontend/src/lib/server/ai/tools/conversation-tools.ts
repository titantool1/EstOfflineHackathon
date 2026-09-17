import "server-only";
import { AiError } from "../contracts.ts";
import type { ConversationTurn, FunctionDefinition } from "../conversation-contracts.ts";
import type { ConditionChange, ConditionMemory } from "../application/condition-memory.ts";
import { applyConditionChanges, conditionView } from "../application/condition-memory.ts";
import type { createUserConditionLoader } from "../adapters/user-condition-context.ts";
import type { createCatalogTools } from "./catalog-tools.ts";
import type { createPlaceTools } from "./place-tools.ts";
import { compactCatalogEvidence } from "./catalog-evidence.ts";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !(key in value)))
    throw new AiError("INVALID_TOOL_ARGUMENTS");
}
const personalDefinitions: FunctionDefinition[] = [
  { type: "function", name: "load_user_conditions", strict: true,
    description: "이번 턴에 상세 조회한 행동의 사용자 입력과 DB 사실을 읽는다. 미입력·대상 미선택·미연결 조건을 구분하며 자격 판정은 하지 않는다. 대상은 서버의 현재 선택을 사용한다.",
    parameters: { type: "object", additionalProperties: false, required: ["programKey", "actionId"], properties: {
      programKey: { type: "string" }, actionId: { type: "string" },
    } } },
  { type: "function", name: "update_conditions", strict: true,
    description: "현재 사용자 발화의 명시적 사실/정정/모름/거절만 상담 메모리에 반영한다. 등록된 slotId와 원문 quote가 필요하다. DB에 영구 저장하지 않는다.",
    parameters: { type: "object", additionalProperties: false, required: ["changes"], properties: {
      changes: { type: "array", minItems: 1, maxItems: 50, items: {
        type: "object", additionalProperties: false, required: ["slotId", "status", "value", "quote"], properties: {
          slotId: { type: "string" }, status: { type: "string", enum: ["known", "unknown", "refused"] },
          value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }, { type: "array", items: { type: "string" } }] },
          quote: { type: "string" },
        },
      } },
    } } },
];

// One instance per turn: candidate facts and selected action IDs cannot leak across users/turns.
export function createConversationTools(options: {
  catalog: ReturnType<typeof createCatalogTools>; load: ReturnType<typeof createUserConditionLoader>;
  places?: ReturnType<typeof createPlaceTools>;
  turn: ConversationTurn; memory: ConditionMemory;
}) {
  const { catalog, load, turn } = options;
  if (options.memory.userId !== turn.authenticatedUserId) throw new AiError("CONDITION_MEMORY_OWNER_MISMATCH");
  let memory = structuredClone(options.memory), searches = 0, details = 0, placeSearches = 0;
  const candidates = new Set<string>(), inspected = new Set<string>();
  const key = (program: unknown, action: unknown) => JSON.stringify([program, action]);
  return {
    definitions: [...catalog.definitions, ...(options.places?.definitions ?? []), ...personalDefinitions] as FunctionDefinition[],
    memory: () => structuredClone(memory),
    async execute(name: string, args: unknown, signal: AbortSignal): Promise<unknown> {
      signal.throwIfAborted();
      if (name === "search_places" && options.places) {
        if (++placeSearches > 2) throw new AiError("PLACE_SEARCH_LIMIT");
        return options.places.execute(name, args, { requestId: turn.requestId, signal, sessionHeaders: turn.sessionHeaders });
      }
      if (name === "search_catalog") {
        if (++searches > 3) throw new AiError("CATALOG_SEARCH_LIMIT");
        const result = await catalog.execute(name, args, { requestId: turn.requestId, signal });
        if (result.status === "ok" && object(result.data) && Array.isArray(result.data.items))
          for (const item of result.data.items) if (object(item)) candidates.add(key(item.program_key, item.action_id));
        return result;
      }
      if (name === "get_catalog_action") {
        exact(args, ["programKey", "actionId"]);
        if (!candidates.has(key(args.programKey, args.actionId))) throw new AiError("CURRENT_CATALOG_CANDIDATE_REQUIRED");
        if (++details > 2) throw new AiError("CATALOG_DETAIL_LIMIT");
        const result = await catalog.execute(name, args, { requestId: turn.requestId, signal });
        if (result.status === "ok") inspected.add(key(args.programKey, args.actionId));
        return compactCatalogEvidence(result);
      }
      if (name === "load_user_conditions") {
        exact(args, ["programKey", "actionId"]);
        if (typeof args.programKey !== "string" || typeof args.actionId !== "string"
          || !inspected.has(key(args.programKey, args.actionId))) throw new AiError("CURRENT_CATALOG_DETAIL_REQUIRED");
        const result = await load({ ...turn, programKey: args.programKey, actionId: args.actionId, signal }, memory);
        if (result.body.error || !result.memory) throw new AiError(result.body.error?.code ?? "CONDITION_CONTEXT_UNAVAILABLE");
        memory = result.memory;
        return { status: "ok", context: result.body.data, bindings: result.bindings, conditions: conditionView(memory) };
      }
      if (name === "update_conditions") {
        exact(args, ["changes"]);
        if (!Array.isArray(args.changes) || !args.changes.length || args.changes.length > 50) throw new AiError("INVALID_TOOL_ARGUMENTS");
        for (const change of args.changes) {
          exact(change, ["slotId", "status", "value", "quote"]);
          if (typeof change.slotId !== "string" || typeof change.quote !== "string"
            || !["known", "unknown", "refused"].includes(String(change.status))) throw new AiError("INVALID_TOOL_ARGUMENTS");
        }
        try {
          memory = applyConditionChanges(memory, turn.authenticatedUserId, { id: turn.turnId, text: turn.text }, args.changes as ConditionChange[]);
        } catch { throw new AiError("INVALID_CONDITION_UPDATE"); }
        return { status: "ok", persistence: "conversation_only", conditions: conditionView(memory) };
      }
      throw new AiError("TOOL_NOT_AVAILABLE");
    },
  };
}
