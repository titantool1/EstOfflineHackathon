import "server-only";
import OpenAI from "openai";
import type { Response as OpenAIResponse, ResponseInput, FunctionTool } from "openai/resources/responses/responses";
import { AiError } from "../contracts.ts";
import type { ConversationProvider } from "../conversation-contracts.ts";

export function createConversationProvider(options: { apiKey: string; model: string; fetch?: typeof fetch }): ConversationProvider {
  const client = () => {
    if (!options.apiKey.trim()) throw new AiError("MODEL_NOT_CONFIGURED");
    return new OpenAI({ apiKey: options.apiKey, timeout: 45_000, maxRetries: 0, fetch: options.fetch });
  };
  const failure = (error: unknown, signal: AbortSignal): never => {
    if (error instanceof AiError) throw error;
    throw new AiError(signal.aborted ? "AI_CANCELLED" : "MODEL_UNAVAILABLE");
  };
  const request = (handle: { id: string }, input: ResponseInput, tools: FunctionTool[], instructions: string) => ({
    model: options.model, conversation: handle.id, input,
    instructions, tools, parallel_tool_calls: false,
    tool_choice: tools.length ? "auto" as const : "none" as const,
    reasoning: { effort: "low" as const }, max_output_tokens: 2200, store: true,
  });
  const reply = (response: OpenAIResponse) => ({
    text: response.output_text?.trim() || null,
    calls: response.output.filter(item => item.type === "function_call").map(item => ({
      callId: item.call_id, name: item.name, arguments: item.arguments,
    })),
  });
  return {
    async create(history, signal) {
      signal.throwIfAborted();
      try {
        const conversation = await client().conversations.create({ items: history }, { signal });
        return { id: conversation.id, responseIds: [] };
      } catch (error) { return failure(error, signal); }
    },
    async respond(handle, input, tools, instructions, signal, onTextDelta) {
      signal.throwIfAborted();
      try {
        const sdk = client();
        const params = request(handle, input as ResponseInput, tools as FunctionTool[], instructions);
        if (onTextDelta) {
          const stream = sdk.responses.stream(params, { signal });
          for await (const event of stream) {
            if (event.type === "response.created" && !handle.responseIds.includes(event.response.id))
              handle.responseIds.push(event.response.id);
            if (event.type === "response.output_text.delta") onTextDelta(event.delta);
          }
          const response = await stream.finalResponse();
          if (!handle.responseIds.includes(response.id)) handle.responseIds.push(response.id);
          if (response.status !== "completed") throw new AiError("MODEL_INCOMPLETE");
          return reply(response);
        }
        const response = await sdk.responses.create(params, { signal });
        // Track even incomplete responses independently of the working condition memory.
        handle.responseIds.push(response.id);
        if (response.status !== "completed") throw new AiError("MODEL_INCOMPLETE");
        return reply(response);
      } catch (error) { return failure(error, signal); }
    },
    async close(handle, signal) {
      const sdk = client();
      const absent = async (action: () => Promise<unknown>) => {
        try { await action(); }
        catch (error) { if (!(error instanceof OpenAI.APIError && error.status === 404)) throw error; }
      };
      let failed = false;
      try {
        const ids: string[] = [];
        try {
          for await (const item of sdk.conversations.items.list(handle.id, { limit: 100 }, { signal })) {
            if (typeof item.id !== "string" || !item.id) throw new AiError("INVALID_CONVERSATION_ITEM");
            ids.push(item.id);
          }
        } catch (error) { if (!(error instanceof OpenAI.APIError && error.status === 404)) throw error; }
        // Conversation deletion alone does not delete its items.
        for (const id of ids) await absent(() => sdk.conversations.items.delete(id, { conversation_id: handle.id }, { signal }));
        await absent(() => sdk.conversations.delete(handle.id, { signal }));
      } catch { failed = true; }
      for (const id of handle.responseIds) {
        try { await absent(() => sdk.responses.delete(id, { signal })); }
        catch { failed = true; }
      }
      if (failed) throw new AiError("CONVERSATION_CLEANUP_PENDING");
    },
  };
}
