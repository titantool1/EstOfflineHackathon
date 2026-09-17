import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatService, ChatFailure } from "../src/lib/server/chat/chat-service.ts";
import { createChatHandlers } from "../src/lib/server/chat/chat-http.ts";
import { createChatClient } from "../src/features/chat/chat-client.ts";
import { chatRequest } from "../src/lib/server/chat/request-boundary.ts";
import { createConditionMemory } from "../src/lib/server/ai/application/condition-memory.ts";
import type { ConversationResult } from "../src/lib/server/ai/application/conversation-session.ts";
import type { ChatTurnEvent } from "../src/lib/chat-stream.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const tab = "00000000-0000-4000-8000-000000000011";
const secondTab = "00000000-0000-4000-8000-000000000012";
const context = (userId = owner, signal = new AbortController().signal) => ({ userId, signal, cookie: "member", requestId: "refresh-test" });
const input = (message: string, clientSessionId = tab) => ({ message, clientSessionId, clientRequestId: crypto.randomUUID() });

function runtime() {
  let calls = 0;
  return {
    get calls() { return calls; },
    createSession(userId: string) { return { userId, memory: createConditionMemory(userId, []), history: [], provider: null, retired: [] }; },
    async runTurn(_session: unknown, turn: { authenticatedUserId: string; text: string },
      options: { commit: (value: ConversationResult) => Promise<void>; signal?: AbortSignal; onEvent?: (event: ChatTurnEvent) => void }) {
      calls++;
      options.signal?.throwIfAborted();
      options.onEvent?.({ type: "delta", text: "임시 답변" });
      const value = { text: `답변:${turn.text}`, memory: createConditionMemory(turn.authenticatedUserId, []), modelCalls: 1, toolCalls: 0 };
      await options.commit(value); return value;
    },
    async closeSession() {},
  };
}

test("refresh restores completed transcript and continues the same conversation without another generation", async () => {
  const model = runtime(), chat = createChatService(model);
  const sent = await chat.send(input("첫 질문"),context());
  const restored = await chat.restore(tab,owner,"renewed-cookie");
  assert.equal(restored.state,"active");
  if (restored.state !== "active") throw new Error();
  assert.equal(restored.conversationId,sent.conversationId);
  assert.deepEqual(restored.messages,[{ role: "user", text: "첫 질문" },{ role: "assistant", text: "답변:첫 질문" }]);
  assert.equal(model.calls,1);
  restored.messages[0].text = "browser mutation";
  const next = await chat.send({ ...input("이어 질문"), conversationId: restored.conversationId },context());
  assert.equal(next.conversationId,sent.conversationId);
  const again = await chat.restore(tab,owner,"member");
  assert.equal(again.state,"active");
  if (again.state === "active") { assert.equal(again.messages.length,4); assert.equal(again.messages[0].text,"첫 질문"); }
});

test("a disconnected first turn is recoverable while generating, and retry cannot duplicate it", async () => {
  const model = runtime(), original = model.runTurn;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  model.runTurn = async (...args: Parameters<typeof original>) => { await waiting; return original(...args); };
  const chat = createChatService(model), disconnected = new AbortController();
  const sending = chat.send(input("진행 질문"), { ...context(owner,disconnected.signal), onEvent() { throw new Error("stream detached"); } });
  disconnected.abort();
  const active = await chat.restore(tab,owner,"member");
  assert.equal(active.state,"active");
  if (active.state === "active") {
    assert.equal(active.generating,true); assert.equal(active.pendingMessage,"진행 질문");
    assert.equal(active.remainingIdleMs,null); assert.deepEqual(active.messages,[]);
  }
  await assert.rejects(chat.send(input("중복"),context()),(error: unknown) => error instanceof ChatFailure && error.code === "CONVERSATION_BUSY");
  release(); await sending;
  assert.equal(model.calls,1);
  const completed = await chat.restore(tab,owner,"member");
  if (completed.state !== "active") throw new Error();
  assert.equal(completed.generating,false); assert.equal(completed.messages[1].text,"답변:진행 질문");
});

test("restoration does not extend the idle deadline, and expiry returns its real save outcome", async () => {
  let now = 0, timerId = 0;
  const jobs = new Map<number,{ at: number; callback: () => void }>();
  const chat = createChatService(runtime(),{ clock: () => now, timers: {
    setTimeout(callback,delay) { const id = ++timerId; jobs.set(id,{ at: now + delay, callback }); return id; },
    clearTimeout(id) { jobs.delete(id as number); },
  } });
  await chat.send(input("질문"),context());
  now = 40_000;
  let snapshot = await chat.restore(tab,owner,"member");
  assert.equal(snapshot.state,"active");
  if (snapshot.state === "active") assert.equal(snapshot.remainingIdleMs,50_000);
  now = 89_000;
  snapshot = await chat.restore(tab,owner,"member");
  if (snapshot.state === "active") assert.equal(snapshot.remainingIdleMs,1000);
  now = 90_000;
  for (const [id,job] of jobs) if (job.at <= now) { jobs.delete(id); job.callback(); }
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await chat.restore(tab,owner,"member"),{ state: "closed", saveStatus: "no_changes" });
});

test("restoration isolates owners and tab identifiers; manual new chat and process loss do not resurrect history", async () => {
  const chat = createChatService(runtime());
  const sent = await chat.send(input("내 비공개 질문"),context());
  assert.deepEqual(await chat.restore(tab,"another-owner","other-cookie"),{ state: "missing" });
  assert.deepEqual(await chat.restore(secondTab,owner,"member"),{ state: "missing" });
  await chat.close(sent.conversationId,owner,"member");
  assert.deepEqual(await chat.restore(tab,owner,"member"),{ state: "closed", saveStatus: "no_changes" });
  const fresh = await chat.send(input("새 질문",secondTab),context());
  assert.notEqual(fresh.conversationId,sent.conversationId);
  const freshState = await chat.restore(secondTab,owner,"member");
  if (freshState.state !== "active") throw new Error();
  assert.equal(freshState.messages.length,2);
  assert.deepEqual(await createChatService(runtime()).restore(secondTab,owner,"member"),{ state: "missing" });
});

test("restore HTTP authenticates, rejects cross-site/invalid IDs and returns no-store display data only", async () => {
  const chat = createChatService(runtime());
  await chat.send(input("비공개 질문"),context());
  let authentications = 0;
  const handlers = createChatHandlers(async () => ({ chat, member: async cookie => {
    authentications++;
    if (!cookie) throw new ChatFailure(401,"AUTHENTICATION_REQUIRED","로그인해 주세요.");
    return { userId: cookie === "member" ? owner : "other-owner", email: "", nickname: "" };
  } }));
  function request(cookie = "member", sessionId = tab, site = "same-origin") {
    return new Request(`http://app.test/api/chat?clientSessionId=${sessionId}`,{ headers: { Cookie: cookie,"Sec-Fetch-Site":site } });
  }
  assert.equal((await handlers.GET(request("member",tab,"cross-site"))).status,403);
  assert.equal((await handlers.GET(request("member","invalid"))).status,400);
  assert.equal(authentications,0);
  assert.equal((await handlers.GET(request(""))).status,401);
  const other = await handlers.GET(request("other"));
  assert.deepEqual((await other.json()).data,{ state: "missing" });
  const response = await handlers.GET(request());
  assert.equal(response.status,200); assert.equal(response.headers.get("Cache-Control"),"no-store");
  const text = await response.text();
  assert.match(text,/비공개 질문/); assert.doesNotMatch(text,/memory|provider|sessionHeaders|conditionSlots/);
});

test("client restores snapshots with credentials and validates invalid data without altering server state", async () => {
  let observed = "";
  const client = createChatClient(async (url,options) => {
    observed = String(url);
    assert.equal(options?.credentials,"same-origin"); assert.equal(options?.cache,"no-store");
    assert.equal(options?.method,undefined);
    return Response.json({ data: { state: "missing" },error:null,requestId:"test" });
  });
  assert.deepEqual(await client.restore(tab),{ state:"missing" });
  assert.equal(observed,`/api/chat?clientSessionId=${tab}`);
  await assert.rejects(createChatClient(async () => Response.json({ data:{ state:"active",messages:[] },error:null,requestId:"test" })).restore(tab));
  assert.equal(chatRequest({ ...input("질문"),clientSessionId:"not-a-uuid" }),null);
});
