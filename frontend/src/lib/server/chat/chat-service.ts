import "server-only";
import { randomUUID } from "node:crypto";
import { AiError } from "../ai/contracts.ts";
import type { ConversationSession, ConversationTurn } from "../ai/conversation-contracts.ts";
import type { ConversationResult } from "../ai/application/conversation-session.ts";

type Runtime = {
  createSession(userId: string): ConversationSession;
  runTurn(session: ConversationSession, turn: ConversationTurn, options: {
    commit: (result: ConversationResult) => Promise<void>; signal?: AbortSignal;
  }): Promise<ConversationResult>;
  closeSession(session: ConversationSession, signal?: AbortSignal): Promise<void>;
};
type Entry = { owner: string; session: ConversationSession; failed: boolean };
export class ChatFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
const messages: Record<string, string> = {
  CONVERSATION_BUSY: "이 상담의 답변을 만들고 있어요.",
  CONVERSATION_CLOSED: "상담이 끝났어요. 새 상담을 시작해 주세요.",
  MODEL_NOT_CONFIGURED: "AI 연결 설정을 확인해 주세요.",
  MODEL_UNAVAILABLE: "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요.",
  AI_CANCELLED: "요청이 취소되었어요. 새 상담을 시작해 주세요.",
};

export function createChatService(runtime: Runtime) {
  const entries = new Map<string, Entry>();
  const fail = (status: number, code: string, fallback?: string): never => {
    throw new ChatFailure(status, code, messages[code] ?? fallback ?? "요청을 완료하지 못했습니다.");
  };
  return {
    async send(input: { conversationId?: string; clientRequestId: string; message: string }, context: {
      userId: string; cookie: string; requestId: string; signal: AbortSignal;
    }): Promise<{ conversationId: string; message: { role: "assistant"; text: string } }> {
      let conversationId = input.conversationId;
      let entry = conversationId ? entries.get(conversationId) : undefined;
      if (!conversationId) {
        conversationId = randomUUID();
        entry = { owner: context.userId, session: runtime.createSession(context.userId), failed: false };
        entries.set(conversationId, entry);
      }
      const active = entry ?? fail(409, "CONVERSATION_EXPIRED", "상담이 만료되었어요. 새 상담을 시작해 주세요.");
      if (active.owner !== context.userId) fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      if (active.failed) fail(409, "CONVERSATION_CLOSED");
      const turn: ConversationTurn = { authenticatedUserId: context.userId, turnId: input.clientRequestId,
        text: input.message, sessionHeaders: { Cookie: context.cookie }, requestId: context.requestId };
      try {
        let committed = false;
        const answer = await runtime.runTurn(active.session, turn, { signal: context.signal,
          commit: async () => { committed = true; } });
        if (!committed) fail(503, "CHAT_COMMIT_FAILED");
        return { conversationId, message: { role: "assistant" as const, text: answer.text } };
      } catch (error) {
        if (error instanceof AiError && error.code === "CONVERSATION_BUSY") return fail(409, error.code);
        active.failed = true;
        try { await runtime.closeSession(active.session, AbortSignal.timeout(5_000)); } catch {}
        if (error instanceof AiError) return fail(503, error.code);
        return fail(503, "CHAT_UNAVAILABLE", "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요.");
      }
    },
    async close(conversationId: string, userId: string) {
      const entry = entries.get(conversationId);
      const active = entry ?? fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      if (active.owner !== userId) fail(404, "CONVERSATION_NOT_FOUND", "상담을 찾을 수 없습니다.");
      entries.delete(conversationId);
      try { await runtime.closeSession(active.session, AbortSignal.timeout(5_000)); } catch {}
    },
  };
}
