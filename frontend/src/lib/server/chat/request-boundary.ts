export type ChatRequest = { conversationId?: string; clientRequestId: string; message: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function chatRequest(value: unknown): ChatRequest | null {
  if (!object(value) || typeof value.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value.clientRequestId)
      || (value.conversationId !== undefined && !uuid(value.conversationId)) || typeof value.message !== "string") return null;
  const message = value.message.trim();
  return message && message.length <= 2000
    ? { conversationId: value.conversationId as string | undefined, clientRequestId: value.clientRequestId, message } : null;
}
export function sameOrigin(request: Request) { return request.headers.get("Origin") === new URL(request.url).origin; }
