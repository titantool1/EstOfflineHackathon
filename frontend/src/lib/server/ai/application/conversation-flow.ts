import "server-only";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { AiError } from "../contracts.ts";
import { endsToolUseForTurn, toolFailureCompletion } from "./tool-failure-policy.ts";
import type {
  ConversationHandle,
  ConversationProvider,
  FunctionCall,
  FunctionDefinition,
  ModelInput,
  ModelReply,
  ConversationEventSink,
} from "../conversation-contracts.ts";

const MODEL_CALL_LIMIT = 6;
const TOOL_CALL_LIMIT = 5;
const TOOL_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

type RunInput = {
  conversation: ConversationHandle;
  text: string;
  turnId: string;
  instructions: string | (() => string);
  tools: FunctionDefinition[];
  execute: (name: string, args: unknown, signal: AbortSignal) => Promise<unknown>;
  onEvent?: ConversationEventSink;
};

const State = Annotation.Root({
  nextInput: Annotation<ModelInput[]>(),
  reply: Annotation<ModelReply | null>(),
  text: Annotation<string>(),
  modelCalls: Annotation<number>(),
  toolCalls: Annotation<number>(),
  seenCallIds: Annotation<string[]>(),
  finishAfterToolFailure: Annotation<boolean>(),
});

function cancelled(signal: AbortSignal): never {
  if (signal.aborted) throw new AiError("AI_CANCELLED");
  throw new AiError("AI_CANCELLED");
}

function isAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted || error instanceof AiError && error.code === "AI_CANCELLED"
    || !!error && typeof error === "object" && "name" in error
      && (error as { name?: unknown }).name === "AbortError";
}

function validateReply(value: unknown): ModelReply {
  if (!value || typeof value !== "object") throw new AiError("INVALID_MODEL_OUTPUT");
  const reply = value as Partial<ModelReply>;
  if (reply.text !== null && typeof reply.text !== "string" || !Array.isArray(reply.calls)
      || reply.calls.length > 1) throw new AiError("INVALID_MODEL_OUTPUT");
  for (const call of reply.calls) {
    if (!call || typeof call !== "object" || typeof call.callId !== "string" || !call.callId.trim()
        || typeof call.name !== "string" || !call.name.trim()
        || typeof call.arguments !== "string") throw new AiError("INVALID_MODEL_OUTPUT");
  }
  if (!reply.calls.length) {
    const text = reply.text?.trim();
    if (!text || text.length > 6000) throw new AiError("INVALID_MODEL_OUTPUT");
  }
  return reply as ModelReply;
}

function toolFailure(code: string, stopRetry = false) {
  return JSON.stringify({ status: "error", error: { code }, ...(stopRetry ? { retryable_in_turn: false } : {}) });
}

function failureCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && TOOL_CODE.test(code)) return code;
  }
  return "TOOL_FAILED";
}

function toolOutput(value: unknown) {
  try {
    const output = JSON.stringify(value);
    return output === undefined ? toolFailure("TOOL_FAILED") : output;
  } catch {
    return toolFailure("TOOL_FAILED");
  }
}

function validateInput(input: RunInput) {
  if (typeof input.text !== "string" || !input.text.trim() || input.text.length > 2000
      || typeof input.turnId !== "string" || !input.turnId.trim() || input.turnId.length > 100
      || !["string", "function"].includes(typeof input.instructions) || !Array.isArray(input.tools)
      || typeof input.execute !== "function") throw new AiError("INVALID_INPUT");
  const names = new Set<string>();
  for (const tool of input.tools) {
    if (!tool || tool.type !== "function" || typeof tool.name !== "string" || !tool.name.trim()
        || names.has(tool.name)) throw new AiError("INVALID_INPUT");
    names.add(tool.name);
  }
  return names;
}

function currentInstructions(value: RunInput["instructions"]) {
  const instructions = typeof value === "function" ? value() : value;
  if (typeof instructions !== "string") throw new AiError("INVALID_INPUT");
  return instructions;
}

function toolProgress(name: string) {
  if (name === "search_catalog") return "searching" as const;
  if (name === "get_catalog_action") return "reading" as const;
  if (name === "load_user_conditions") return "checking_conditions" as const;
  if (name === "update_conditions") return "updating_conditions" as const;
  return "thinking" as const;
}

export function createConversationGraph(provider: Pick<ConversationProvider, "respond">) {
  return async function run(input: RunInput, signal: AbortSignal) {
    const offeredTools = validateInput(input);
    if (signal.aborted) cancelled(signal);

    const graph = new StateGraph(State)
      .addNode("model", async (state) => {
        if (signal.aborted) cancelled(signal);
        if (state.modelCalls >= MODEL_CALL_LIMIT) throw new AiError("MODEL_CALL_LIMIT");
        input.onEvent?.({ type: "reset" });
        input.onEvent?.({ type: "progress", stage: "thinking" });
        let reply: ModelReply;
        try {
          const instructions = currentInstructions(input.instructions)
            + (state.finishAfterToolFailure ? "\n\n" + toolFailureCompletion : "");
          let streamedLength = 0, answering = false;
          const onEvent = input.onEvent;
          const onTextDelta = onEvent ? (text: string) => {
            if (typeof text !== "string") throw new AiError("INVALID_MODEL_OUTPUT");
            streamedLength += text.length;
            if (streamedLength > 6000) throw new AiError("INVALID_MODEL_OUTPUT");
            if (!text) return;
            if (!answering) {
              onEvent({ type: "progress", stage: "answering" });
              answering = true;
            }
            onEvent({ type: "delta", text });
          } : undefined;
          reply = validateReply(await provider.respond(input.conversation, state.nextInput,
            state.finishAfterToolFailure ? [] : input.tools, instructions, signal, onTextDelta));
          if (state.finishAfterToolFailure && reply.calls.length) throw new AiError("INVALID_MODEL_OUTPUT");
        } catch (error) {
          if (isAbort(error, signal)) cancelled(signal);
          throw error instanceof AiError ? error : new AiError("MODEL_FAILED");
        }
        if (signal.aborted) cancelled(signal);
        if (reply.calls.length) input.onEvent?.({ type: "reset" });
        return {
          reply,
          text: reply.calls.length ? "" : reply.text!.trim(),
          modelCalls: state.modelCalls + 1,
        };
      })
      .addNode("tool", async (state) => {
        if (signal.aborted) cancelled(signal);
        const call = state.reply!.calls[0] as FunctionCall;
        if (!offeredTools.has(call.name)) throw new AiError("TOOL_NOT_AVAILABLE");
        if (state.seenCallIds.includes(call.callId)) throw new AiError("DUPLICATE_TOOL_CALL_ID");
        if (state.toolCalls >= TOOL_CALL_LIMIT) throw new AiError("TOOL_CALL_LIMIT");

        let output: string | undefined;
        let finishAfterToolFailure = false;
        let args: unknown;
        try {
          args = JSON.parse(call.arguments);
        } catch {
          output = toolFailure("INVALID_TOOL_ARGUMENTS");
        }
        if (output === undefined) {
          input.onEvent?.({ type: "progress", stage: toolProgress(call.name) });
          try {
            output = toolOutput(await input.execute(call.name, args, signal));
          } catch (error) {
            if (isAbort(error, signal)) cancelled(signal);
            finishAfterToolFailure = endsToolUseForTurn(error);
            output = toolFailure(failureCode(error), finishAfterToolFailure);
          }
        }
        if (signal.aborted) cancelled(signal);
        return {
          nextInput: [{ type: "function_call_output", call_id: call.callId, output }],
          reply: null,
          toolCalls: state.toolCalls + 1,
          seenCallIds: [...state.seenCallIds, call.callId],
          finishAfterToolFailure,
        };
      })
      .addEdge(START, "model")
      .addConditionalEdges("model", (state) => state.reply!.calls.length ? "tool" : END)
      .addEdge("tool", "model")
      .compile();

    const result = await (async () => {
      try {
        return await graph.invoke({
          nextInput: [{ role: "user", content: `[user-turn:${input.turnId}]\n${input.text}` }],
          reply: null,
          text: "",
          modelCalls: 0,
          toolCalls: 0,
          seenCallIds: [],
          finishAfterToolFailure: false,
        }, { signal, recursionLimit: 20 });
      } catch (error) {
        if (isAbort(error, signal)) cancelled(signal);
        throw error;
      }
    })();
    return { text: result.text, modelCalls: result.modelCalls, toolCalls: result.toolCalls };
  };
}
