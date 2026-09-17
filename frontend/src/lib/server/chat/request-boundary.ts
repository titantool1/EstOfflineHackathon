export type ChatRequest = { conversationId?: string; clientSessionId?: string; clientRequestId: string; message: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function chatRequest(value: unknown): ChatRequest | null {
  if (!object(value) || typeof value.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value.clientRequestId)
      || (value.conversationId !== undefined && !uuid(value.conversationId))
      || (value.clientSessionId !== undefined && !uuid(value.clientSessionId)) || typeof value.message !== "string") return null;
  const message = value.message.trim();
  return message && message.length <= 2000
    ? { conversationId: value.conversationId as string | undefined, clientRequestId: value.clientRequestId, message,
        ...(value.clientSessionId ? { clientSessionId: value.clientSessionId as string } : {}) } : null;
}
export function sameOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("Host") ?? requestUrl.host;
  const origin = request.headers.get("Origin");
  if (!origin || !host || /[\\/@,\s]/.test(host)) return false;
  try {
    const expected = new URL(`${requestUrl.protocol}//${host}`);
    const actual = new URL(origin);
    return ["http:", "https:"].includes(expected.protocol)
      && actual.username === "" && actual.password === "" && actual.pathname === "/" && actual.search === "" && actual.hash === ""
      && actual.origin === expected.origin;
  } catch { return false; }
}
