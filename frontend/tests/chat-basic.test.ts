import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatService, ChatFailure } from "../src/lib/server/chat/chat-service.ts";
import { createMemberContext } from "../src/lib/server/chat/member-context.ts";
import { createConditionMemory } from "../src/lib/server/ai/application/condition-memory.ts";
import { AiError } from "../src/lib/server/ai/contracts.ts";
import { chatRequest, sameOrigin } from "../src/lib/server/chat/request-boundary.ts";

const owner = "00000000-0000-4000-8000-000000000001";
function runtime() {
  const turns: { owner: string; text: string; cookie?: string }[] = [];
  let closes = 0;
  return {
    turns,
    get closes() { return closes; },
    createSession(userId: string) { return { userId, memory: createConditionMemory(userId, []), history: [], provider: null, retired: [] }; },
    async runTurn(_session: unknown, turn: { authenticatedUserId: string; text: string; sessionHeaders?: HeadersInit }, options: { commit: (result: unknown) => Promise<void> }) {
      turns.push({ owner: turn.authenticatedUserId, text: turn.text, cookie: new Headers(turn.sessionHeaders).get("Cookie") ?? undefined });
      const result = { text: `답변:${turn.text}`, memory: createConditionMemory(turn.authenticatedUserId, []), modelCalls: 1, toolCalls: 0 };
      await options.commit(result);
      return result;
    },
    async closeSession() { closes++; },
  };
}
const context = (userId = owner) => ({ userId, cookie: "ECOTEAMSESSION=test", requestId: "chat-test", signal: new AbortController().signal });

test("authenticated owner keeps one in-process conversation and receives committed answers", async () => {
  const fake = runtime();
  const chat = createChatService(fake);
  const first = await chat.send({ clientRequestId: "turn-1", message: "첫 질문" }, context());
  const second = await chat.send({ conversationId: first.conversationId, clientRequestId: "turn-2", message: "다음 질문" }, context());
  assert.equal(first.message.text, "답변:첫 질문");
  assert.equal(second.conversationId, first.conversationId);
  assert.deepEqual(fake.turns, [
    { owner, text: "첫 질문", cookie: "ECOTEAMSESSION=test" },
    { owner, text: "다음 질문", cookie: "ECOTEAMSESSION=test" },
  ]);
});

test("conversation IDs are server-owned and another member cannot use or close them", async () => {
  const chat = createChatService(runtime());
  const first = await chat.send({ clientRequestId: "turn-1", message: "질문" }, context());
  const other = context("00000000-0000-4000-8000-000000000002");
  await assert.rejects(chat.send({ conversationId: first.conversationId, clientRequestId: "turn-2", message: "탈취" }, other),
    (error: unknown) => error instanceof ChatFailure && error.status === 404);
  await assert.rejects(chat.close(first.conversationId, other.userId),
    (error: unknown) => error instanceof ChatFailure && error.status === 404);
});

test("model failure closes the current conversation and requires a new one", async () => {
  const fake = runtime();
  const chat = createChatService(fake);
  const first = await chat.send({ clientRequestId: "turn-1", message: "정상 질문" }, context());
  fake.runTurn = async () => { throw new AiError("MODEL_UNAVAILABLE"); };
  await assert.rejects(chat.send({ conversationId: first.conversationId, clientRequestId: "turn-2", message: "실패 질문" }, context()),
    (error: unknown) => error instanceof ChatFailure && error.code === "MODEL_UNAVAILABLE");
  assert.equal(fake.closes, 1);
  await assert.rejects(chat.send({ conversationId: first.conversationId, clientRequestId: "turn-3", message: "다시" }, context()),
    (error: unknown) => error instanceof ChatFailure && error.code === "CONVERSATION_CLOSED");
});

test("member lookup uses only the session cookie and maps anonymous access", async () => {
  const calls: Headers[] = [];
  const member = createMemberContext({ baseUrl: "http://spring.test", fetch: async (_url, init) => {
    calls.push(new Headers(init?.headers));
    const id = new Headers(init?.headers).get("X-Request-Id")!;
    return Response.json({ data: null, error: { code: "AUTHENTICATION_REQUIRED", message: "로그인이 필요합니다." }, requestId: id },
      { status: 401, headers: { "X-Request-Id": id } });
  } });
  await assert.rejects(member("ECOTEAMSESSION=test", "member-test", new AbortController().signal),
    (error: unknown) => error instanceof ChatFailure && error.status === 401);
  assert.equal(calls[0].get("Cookie"), "ECOTEAMSESSION=test");
  assert.equal(calls[0].has("X-User-Id"), false);
});

test("request boundary rejects cross-origin, null, and malformed input", () => {
  assert.equal(sameOrigin(new Request("http://app.test/api/chat", { headers: { Origin: "http://evil.test" } })), false);
  assert.equal(sameOrigin(new Request("http://app.test/api/chat", { headers: { Origin: "http://app.test" } })), true);
  assert.equal(chatRequest(null), null);
  assert.equal(chatRequest({ clientRequestId: "bad id", message: "질문" }), null);
  assert.deepEqual(chatRequest({ clientRequestId: "turn-1", message: "  질문  " }),
    { conversationId: undefined, clientRequestId: "turn-1", message: "질문" });
});
