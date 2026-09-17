import type { ConditionMemory } from "./application/condition-memory.ts";

export type HistoryMessage = { role: "user" | "assistant"; content: string };
export type ConversationHandle = { id: string; responseIds: string[] };
export type FunctionDefinition = {
  type: "function"; name: string; description: string; strict: true;
  parameters: Record<string, unknown>;
};
export type ModelInput = HistoryMessage | { type: "function_call_output"; call_id: string; output: string };
export type FunctionCall = { callId: string; name: string; arguments: string };
export type ModelReply = { text: string | null; calls: FunctionCall[] };
export type ConversationProvider = {
  create(history: HistoryMessage[], signal: AbortSignal): Promise<ConversationHandle>;
  respond(handle: ConversationHandle, input: ModelInput[], tools: FunctionDefinition[], instructions: string,
    signal: AbortSignal): Promise<ModelReply>;
  close(handle: ConversationHandle, signal: AbortSignal): Promise<void>;
};
// Server-owned state. Never reconstruct it from a browser request body.
export type ConversationSession = {
  userId: string;
  memory: ConditionMemory;
  history: HistoryMessage[];
  provider: ConversationHandle | null;
  retired: ConversationHandle[];
};
export type ConversationTurn = {
  authenticatedUserId: string; turnId: string; text: string;
  // Target IDs selected in the server's member context, not invented by the model.
  householdId?: string; homeId?: string; vehicleId?: string;
  sessionHeaders?: HeadersInit; requestId?: string;
};
