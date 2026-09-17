export type ChatAnswer = { conversationId: string; message: { role: "assistant"; text: string } };
type Envelope<T> = { data: T | null; error: { code: string; message: string } | null; requestId: string };
export class ChatClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export function createChatClient(fetcher: typeof fetch = fetch) {
  async function request<T>(method: "POST" | "DELETE", body: unknown): Promise<T> {
    const response = await fetcher("/api/chat", { method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", credentials: "same-origin" });
    const envelope = await response.json() as Envelope<T>;
    if (!response.ok || envelope.error || !envelope.data)
      throw new ChatClientError(response.status, envelope.error?.code ?? "CHAT_INVALID_RESPONSE",
        envelope.error?.message ?? "답변을 받지 못했습니다.");
    return envelope.data;
  }
  return {
    send: (message: string, conversationId?: string) => request<ChatAnswer>("POST",
      { message, conversationId, clientRequestId: crypto.randomUUID() }),
    close: (conversationId: string) => request<{ closed: true }>("DELETE", { conversationId }),
  };
}
