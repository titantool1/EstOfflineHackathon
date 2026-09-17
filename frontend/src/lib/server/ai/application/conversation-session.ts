import "server-only";
import { AiError } from "../contracts.ts";
import type { ConditionMemory } from "./condition-memory.ts";
import { createConditionMemory } from "./condition-memory.ts";
import type { ConversationProvider, ConversationSession, ConversationTurn } from "../conversation-contracts.ts";
import type { createCatalogTools } from "../tools/catalog-tools.ts";
import type { createUserConditionLoader } from "../adapters/user-condition-context.ts";
import { createConversationTools } from "../tools/conversation-tools.ts";
import { createConversationGraph } from "./conversation-flow.ts";
import { createConversationContext } from "./conversation-context.ts";

export type ConversationResult = { text: string; memory: ConditionMemory; modelCalls: number; toolCalls: number };

export function createConversationRunner(ports: {
  provider: ConversationProvider; catalog: ReturnType<typeof createCatalogTools>; load: ReturnType<typeof createUserConditionLoader>;
}) {
  const busy = new WeakSet<ConversationSession>(), closed = new WeakSet<ConversationSession>();
  const run = createConversationGraph(ports.provider);
  async function cleanup(session: ConversationSession, signal: AbortSignal) {
    while (session.retired.length) {
      await ports.provider.close(session.retired[0], signal);
      session.retired.shift();
    }
  }
  return {
    createSession(userId: string): ConversationSession {
      return { userId, memory: createConditionMemory(userId, []), history: [], provider: null, retired: [] };
    },
    async runTurn(session: ConversationSession, turn: ConversationTurn, options: {
      // The caller persists/accepts the completed answer before local memory is committed.
      commit: (result: ConversationResult) => Promise<void>; signal?: AbortSignal;
    }): Promise<ConversationResult> {
      if (closed.has(session)) throw new AiError("CONVERSATION_CLOSED");
      if (session.userId !== turn.authenticatedUserId || session.memory.userId !== session.userId) throw new AiError("CONDITION_MEMORY_OWNER_MISMATCH");
      if (!turn.text.trim() || turn.text.length > 2000 || !turn.turnId.trim() || turn.turnId.length > 100) throw new AiError("INVALID_CONVERSATION_TURN");
      if (busy.has(session)) throw new AiError("CONVERSATION_BUSY");
      const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(85_000)]) : AbortSignal.timeout(85_000);
      signal.throwIfAborted();
      busy.add(session);
      try {
        await cleanup(session, signal);
        session.provider ??= await ports.provider.create(structuredClone(session.history), signal);
        const tools = createConversationTools({ ...ports, turn, memory: session.memory });
        const reply = await run({ conversation: session.provider, text: turn.text, turnId: turn.turnId,
          tools: tools.definitions, execute: tools.execute,
          instructions: () => createConversationContext({ memory: tools.memory(), tools: tools.definitions }),
        }, signal);
        signal.throwIfAborted();
        const result = { ...reply, memory: tools.memory() };
        // Prepare all local state before the durable commit boundary.
        const memory = structuredClone(result.memory);
        const history = [...session.history, { role: "user" as const, content: turn.text },
          { role: "assistant" as const, content: reply.text }].slice(-40);
        await options.commit(structuredClone(result));
        session.memory = memory;
        session.history = history;
        return result;
      } catch (error) {
        // Provider history already includes the failed attempt. Never reuse it for another turn.
        if (session.provider) { session.retired.push(session.provider); session.provider = null; }
        try { await cleanup(session, AbortSignal.timeout(5_000)); }
        catch { /* IDs remain in retired for an explicit close or the next turn. */ }
        throw error;
      } finally { busy.delete(session); }
    },
    async closeSession(session: ConversationSession, signal: AbortSignal = AbortSignal.timeout(10_000)) {
      if (busy.has(session)) throw new AiError("CONVERSATION_BUSY");
      busy.add(session);
      try {
        if (session.provider) { session.retired.push(session.provider); session.provider = null; }
        closed.add(session);
        await cleanup(session, signal);
        session.history = [];
        session.memory = createConditionMemory(session.userId, []);
      } finally { busy.delete(session); }
    },
  };
}
