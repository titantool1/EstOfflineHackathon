import { test } from "node:test";
import assert from "node:assert/strict";
import { createChatClient, ChatClientError } from "../src/features/chat/chat-client.ts";
import { chatStreamResponse } from "../src/lib/server/chat/chat-stream-response.ts";
import { createChatHandlers } from "../src/lib/server/chat/chat-http.ts";
import { createChatService, ChatFailure } from "../src/lib/server/chat/chat-service.ts";
import { createConditionMemory } from "../src/lib/server/ai/application/condition-memory.ts";
import type { ConversationResult } from "../src/lib/server/ai/application/conversation-session.ts";
import type { ChatAnswer, ChatTurnEvent } from "../src/lib/chat-stream.ts";

const answer: ChatAnswer = { conversationId: "00000000-0000-4000-8000-000000000001", message: { role: "assistant", text: "한글 답변 0원, 조건 미확인" } };
const signal = () => new AbortController().signal;
const frame = (event: unknown) => new TextEncoder().encode(JSON.stringify(event) + "\n");
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

test("client observes progress and real partial text before completed answer is available", async () => {
  const partial = deferred(), finish = deferred();
  let complete = false;
  const events: ChatTurnEvent[] = [];
  const response = chatStreamResponse("stream-test", signal(), async emit => {
    emit({ type: "progress", stage: "searching" });
    emit({ type: "delta", text: "한글 " });
    await finish.promise;
    complete = true;
    return answer;
  });
  const client = createChatClient(async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("Accept"), "application/x-ndjson");
    assert.equal(init?.credentials, "same-origin");
    return response;
  });
  const pending = client.send("질문", undefined, { onEvent: event => {
    events.push(event);
    if (event.type === "delta") partial.release();
  } });
  await partial.promise;
  assert.equal(complete, false);
  assert.deepEqual(events, [{ type: "progress", stage: "searching" }, { type: "delta", text: "한글 " }]);
  finish.release();
  assert.deepEqual(await pending, answer);
});

test("NDJSON decoder handles byte-split Korean, multiple frames and draft reset", async () => {
  const data = Buffer.concat([
    frame({ type: "delta", text: "임시" }), frame({ type: "reset" }),
    frame({ type: "delta", text: answer.message.text }), frame({ type: "done", data: answer }),
  ]);
  const response = new Response(new ReadableStream({ start(c) {
    for (const byte of data) c.enqueue(Uint8Array.of(byte));
    c.close();
  } }), { headers: { "Content-Type": "application/x-ndjson" } });
  const events: ChatTurnEvent[] = [];
  const received = await createChatClient(async () => response).send("질문", undefined, { onEvent: e => events.push(e) });
  assert.deepEqual(received, answer);
  assert.deepEqual(events, [{ type: "delta", text: "임시" }, { type: "reset" }, { type: "delta", text: answer.message.text }]);
});

test("partial failure never returns a successful answer and does not expose exception details", async () => {
  const response = chatStreamResponse("stream-test", signal(), async emit => {
    emit({ type: "delta", text: "미완료" });
    throw new Error("private member fact and credentials");
  });
  await assert.rejects(createChatClient(async () => response).send("질문"), (error: unknown) =>
    error instanceof ChatClientError && error.code === "CHAT_UNAVAILABLE" && !error.message.includes("private"));
});

test("truncation, invalid events and excessive draft lengths fail closed", async () => {
  for (const body of [
    JSON.stringify({ type: "delta", text: "미완료" }) + "\n",
    '{"type":"done"',
    JSON.stringify({ type: "progress", stage: "raw_tool_payload" }) + "\n",
    JSON.stringify({ type: "delta", text: "x".repeat(6001) }) + "\n",
  ]) {
    await assert.rejects(createChatClient(async () => new Response(body, {
      headers: { "Content-Type": "application/x-ndjson" },
    })).send("질문"), (error: unknown) => error instanceof ChatClientError && error.code === "CHAT_INVALID_RESPONSE");
  }
});

test("consumer cancellation reaches running work and request abort terminates stream", async () => {
  const cancelled = deferred();
  let workSignal: AbortSignal | undefined;
  const request = new AbortController();
  const response = chatStreamResponse("stream-test", request.signal, async (emit, currentSignal) => {
    workSignal = currentSignal;
    emit({ type: "progress", stage: "thinking" });
    await new Promise<void>(resolve => currentSignal.addEventListener("abort", () => { cancelled.release(); resolve(); }, { once: true }));
    currentSignal.throwIfAborted();
    return answer;
  });
  const reader = response.body!.getReader();
  await reader.read();
  await reader.cancel();
  await cancelled.promise;
  assert.equal(workSignal?.aborted, true);
  const request2 = new AbortController();
  const second = chatStreamResponse("stream-test", request2.signal, async (_emit, s) => {
    await new Promise<void>(resolve => s.addEventListener("abort", () => resolve(), { once: true }));
    s.throwIfAborted(); return answer;
  });
  request2.abort();
  assert.equal(await second.text(), "");
});

function request(cookie = "member-a", stream = true) {
  return new Request("http://app.test/api/chat", { method: "POST", headers: {
    Origin: "http://app.test", "Content-Type": "application/json", Cookie: cookie,
    Accept: stream ? "application/x-ndjson" : "application/json",
  }, body: JSON.stringify({ message: "질문", clientRequestId: "turn-1", userId: "attacker" }) });
}
function fakeRuntime() {
  return {
    createSession(userId: string) { return { userId, memory: createConditionMemory(userId, []), history: [], provider: null, retired: [] }; },
    async runTurn(_session: unknown, turn: { authenticatedUserId: string }, options: { commit: (value: ConversationResult) => Promise<void>; onEvent?: (event: ChatTurnEvent) => void }) {
      options.onEvent?.({ type: "delta", text: "잠정 답변" });
      const value = { text: turn.authenticatedUserId, memory: createConditionMemory(turn.authenticatedUserId, []), modelCalls: 1, toolCalls: 0 };
      // The test exercises the service's commit gate, independent of AI provider internals.
      await options.commit(value);
      return value;
    },
    async closeSession() {},
  };
}

test("HTTP authentication happens before opening stream and only authenticated member owns turn", async () => {
  let calls = 0;
  const chat = createChatService(fakeRuntime());
  const handlers = createChatHandlers(async () => ({ chat, member: async cookie => {
    calls++;
    if (cookie !== "member-a") throw new ChatFailure(401, "AUTHENTICATION_REQUIRED", "로그인해 주세요.");
    return { userId: "member-a", email: "", nickname: "" };
  } }));
  const denied = await handlers.POST(request("anonymous"));
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("Content-Type")!, /application\/json/);
  assert.equal((await denied.json()).data, null);
  const accepted = await handlers.POST(request());
  const received = await createChatClient(async () => accepted).send("질문");
  assert.equal(received.message.text, "member-a");
  const legacy = await handlers.POST(request("member-a", false));
  assert.equal((await legacy.json()).data.message.text, "member-a");
  assert.equal(calls, 3);
});

test("uncommitted turn and wrong conversation owner cannot produce stream done", async () => {
  const runtime = fakeRuntime();
  const chat = createChatService(runtime);
  const context = { userId: "a", cookie: "a", requestId: "test", signal: signal() };
  const first = await chat.send({ message: "질문", clientRequestId: "1" }, context);
  const denied = chatStreamResponse("test", signal(), (onEvent, s) => chat.send({
    message: "질문", clientRequestId: "2", conversationId: first.conversationId,
  }, { ...context, userId: "b", signal: s, onEvent }));
  const deniedFrames = await denied.text();
  assert.match(deniedFrames, /CONVERSATION_NOT_FOUND/);
  assert.doesNotMatch(deniedFrames, /"done"|"delta"/);
  runtime.runTurn = async (_session, turn, options) => {
    options.onEvent?.({ type: "delta", text: "임시" });
    return { text: "커밋 안 됨", memory: createConditionMemory(turn.authenticatedUserId, []), modelCalls: 1, toolCalls: 0 };
  };
  const failed = chatStreamResponse("test", signal(), (onEvent, s) => chat.send({ message: "질문", clientRequestId: "3" }, { ...context, signal: s, onEvent }));
  const frames = await failed.text();
  assert.match(frames, /"delta"/);
  assert.match(frames, /"error"/);
  assert.doesNotMatch(frames, /"done"/);
});
