import { randomUUID } from "node:crypto";
import { ChatFailure } from "./chat-service.ts";
import type { getChatRuntime } from "./runtime.ts";
import { chatStreamResponse } from "./chat-stream-response.ts";
import { chatRequest, sameOrigin, uuid } from "./request-boundary.ts";

function result(requestId: string, data: unknown, error: { code: string; message: string } | null, status = 200) {
  return Response.json({ data, error, requestId }, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}
function requestContext(request: Request) {
  const candidate = request.headers.get("X-Request-Id");
  return { requestId: candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : randomUUID(),
    cookie: request.headers.get("Cookie") ?? "" };
}
function failure(id: string, error: unknown) {
  return error instanceof ChatFailure
    ? result(id, null, { code: error.code, message: error.message }, error.status)
    : result(id, null, { code: "CHAT_UNAVAILABLE", message: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
}

export function createChatHandlers(getRuntime: typeof getChatRuntime) {
  async function POST(request: Request) {
    const context = requestContext(request);
    if (!sameOrigin(request))
      return result(context.requestId, null, { code: "CROSS_ORIGIN_REQUEST", message: "같은 사이트에서 다시 요청해 주세요." }, 403);
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return result(context.requestId, null, { code: "UNSUPPORTED_MEDIA_TYPE", message: "JSON 요청만 지원합니다." }, 415);
    }
    let body;
    try {
      const value: unknown = await request.json();
      body = chatRequest(value);
      if (!body) throw new Error();
    } catch {
      return result(context.requestId, null, { code: "INVALID_CHAT_REQUEST", message: "요청 형식을 확인해 주세요." }, 400);
    }
    try {
      const runtime = await getRuntime();
      const member = await runtime.member(context.cookie, context.requestId, request.signal);
      if (request.headers.get("Accept")?.includes("application/x-ndjson")) {
        return chatStreamResponse(context.requestId, request.signal, (onEvent, signal) =>
          runtime.chat.send(body, { ...context, userId: member.userId, signal, onEvent }));
      }
      const data = await runtime.chat.send(body, { ...context, userId: member.userId, signal: request.signal });
      return result(context.requestId, data, null);
    } catch (error) { return failure(context.requestId, error); }
  }

  async function DELETE(request: Request) {
    const context = requestContext(request);
    if (!sameOrigin(request))
      return result(context.requestId, null, { code: "CROSS_ORIGIN_REQUEST", message: "같은 사이트에서 다시 요청해 주세요." }, 403);
    let body: { conversationId?: unknown };
    try {
      const value: unknown = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      body = value;
    }
    catch { return result(context.requestId, null, { code: "INVALID_CHAT_REQUEST", message: "종료할 상담을 확인해 주세요." }, 400); }
    if (!uuid(body.conversationId)) return result(context.requestId, null, { code: "INVALID_CHAT_REQUEST", message: "종료할 상담을 확인해 주세요." }, 400);
    try {
      const runtime = await getRuntime();
      const member = await runtime.member(context.cookie, context.requestId, request.signal);
      await runtime.chat.close(body.conversationId, member.userId);
      return result(context.requestId, { closed: true }, null);
    } catch (error) { return failure(context.requestId, error); }
  }

  return { POST, DELETE };
}
