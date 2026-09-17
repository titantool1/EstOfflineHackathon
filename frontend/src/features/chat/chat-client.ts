import { sessionFetch } from "../profile/session-fetch.ts";
import type { ChatAnswer, ChatProgress, ChatSnapshot, ChatTurnEvent } from "../../lib/chat-stream.ts";
export type { ChatAnswer } from "../../lib/chat-stream.ts";
type Envelope<T> = { data: T | null; error: { code: string; message: string } | null; requestId: string };
type SendOptions = { signal?: AbortSignal; onEvent?: (event: ChatTurnEvent) => void; clientSessionId?: string };
export type { ChatSaveStatus } from "../../lib/chat-stream.ts";
import type { ChatSaveStatus } from "../../lib/chat-stream.ts";
const stages: ChatProgress[] = ["thinking", "searching", "reading", "checking_conditions", "updating_conditions", "answering"];
export class ChatClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
function invalid(): never {
  throw new ChatClientError(502, "CHAT_INVALID_RESPONSE", "답변 연결이 끊겼어요. 새 상담에서 다시 질문해 주세요.");
}
async function readAnswer(response: Response, options: SendOptions): Promise<ChatAnswer> {
  if (!response.body) invalid();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "", draftLength = 0;
  try {
    while (true) {
      options.signal?.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line || line.length > 64_000) invalid();
        const event = JSON.parse(line);
        if (!event || typeof event !== "object") invalid();
        if (event.type === "done") {
          const data = event.data;
          if (!data || typeof data.conversationId !== "string" || !data.conversationId
            || data.message?.role !== "assistant" || typeof data.message.text !== "string"
            || !data.message.text.trim() || data.message.text.length > 6000) invalid();
          return data;
        }
        if (event.type === "error") {
          if (typeof event.error?.code !== "string" || typeof event.error?.message !== "string") invalid();
          throw new ChatClientError(503, event.error.code, event.error.message);
        }
        if (event.type === "reset") {
          draftLength = 0; options.onEvent?.({ type: "reset" });
        } else if (event.type === "delta" && typeof event.text === "string") {
          draftLength += event.text.length;
          if (draftLength > 6000) invalid();
          options.onEvent?.({ type: "delta", text: event.text });
        } else if (event.type === "progress" && stages.includes(event.stage)) {
          options.onEvent?.({ type: "progress", stage: event.stage });
        } else invalid();
      }
      if (buffer.length > 64_000 || done) invalid();
    }
  } catch (error) {
    if (error instanceof ChatClientError || options.signal?.aborted) throw error;
    invalid();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function createChatClient(fetcher: typeof fetch = sessionFetch) {
  async function envelope<T>(response: Response): Promise<T> {
    const value = await response.json() as Envelope<T>;
    if (!response.ok || value.error || !value.data)
      throw new ChatClientError(response.status, value.error?.code ?? "CHAT_INVALID_RESPONSE",
        value.error?.message ?? "답변을 받지 못했습니다.");
    return value.data;
  }
  return {
    async restore(clientSessionId: string, signal?: AbortSignal): Promise<ChatSnapshot> {
      const value = await envelope<ChatSnapshot>(await fetcher(`/api/chat?clientSessionId=${encodeURIComponent(clientSessionId)}`, {
        cache: "no-store", credentials: "same-origin", signal,
      }));
      if (value.state === "missing") return value;
      if (value.state === "closed" && ["saved", "no_changes", "pending_resolution", "rejected", "outcome_unconfirmed"].includes(value.saveStatus)) return value;
      if (value.state !== "active" || typeof value.conversationId !== "string" || !value.conversationId
        || typeof value.generating !== "boolean" || !Array.isArray(value.messages)
        || value.messages.some(message => !message || !["user", "assistant"].includes(message.role) || typeof message.text !== "string")
        || (value.pendingMessage !== undefined && typeof value.pendingMessage !== "string")
        || (value.remainingIdleMs !== null && (!Number.isFinite(value.remainingIdleMs) || value.remainingIdleMs < 0))) invalid();
      return value;
    },
    async send(message: string, conversationId?: string, options: SendOptions = {}): Promise<ChatAnswer> {
      const response = await fetcher("/api/chat", { method: "POST", headers: {
        "Content-Type": "application/json", Accept: "application/x-ndjson",
      }, body: JSON.stringify({ message, conversationId, clientSessionId: options.clientSessionId, clientRequestId: crypto.randomUUID() }),
      cache: "no-store", credentials: "same-origin", signal: options.signal });
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/x-ndjson"))
        return envelope<ChatAnswer>(response);
      return readAnswer(response, options);
    },
    async keepAlive(conversationId: string, signal?: AbortSignal) {
      return envelope<{ active: true }>(await fetcher("/api/chat", { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }),
        cache: "no-store", credentials: "same-origin", signal }));
    },
    async close(conversationId: string, signal: AbortSignal = AbortSignal.timeout(30_000)) {
      return envelope<{ closed: true; saveStatus: ChatSaveStatus }>(await fetcher("/api/chat", { method: "DELETE",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }),
        cache: "no-store", credentials: "same-origin", signal }));
    },
  };
}
