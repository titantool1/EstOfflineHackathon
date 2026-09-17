import assert from "node:assert/strict";
import { test } from "node:test";
import { AiError } from "../src/lib/server/ai/contracts.ts";
import { applyConditionChanges, conditionSlotId, createConditionMemory } from
  "../src/lib/server/ai/application/condition-memory.ts";
import { createChatService } from "../src/lib/server/chat/chat-service.ts";
import type { ConditionSaveRequest } from "../src/lib/server/ai/application/condition-save.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const input = { inputKey: "membership.is_member", selector: { service_code: "eco" },
  target: { kind: "self" as const, id: owner }, scope: { kind: "user" as const }, valueType: "boolean" as const };
const context = (cookie = "ECOTEAMSESSION=first") => ({ userId: owner, cookie, requestId: "test", signal: new AbortController().signal });

class FakeTimers {
  now = 0;
  next = 1;
  jobs = new Map<number, { at: number; callback: () => void }>();
  setTimeout = (callback: () => void, delay: number) => {
    const id = this.next++; this.jobs.set(id, { at: this.now + delay, callback }); return id;
  };
  clearTimeout = (id: unknown) => { this.jobs.delete(id as number); };
  advance(ms: number) {
    this.now += ms;
    const ready = [...this.jobs].filter(([, job]) => job.at <= this.now).sort((a, b) => a[1].at - b[1].at);
    for (const [id, job] of ready) { if (this.jobs.delete(id)) job.callback(); }
  }
}

function fakeRuntime() {
  let closes = 0;
  let fail = false;
  return {
    get closes() { return closes; },
    set fail(value: boolean) { fail = value; },
    createSession(userId: string) { return { userId, memory: createConditionMemory(userId, []), history: [], provider: null, retired: [] }; },
    async runTurn(_session: unknown, turn: { authenticatedUserId: string; turnId: string },
      options: { commit: (result: { text: string; memory: ReturnType<typeof createConditionMemory>; modelCalls: number; toolCalls: number }) => Promise<void> }) {
      if (fail) throw new AiError("MODEL_UNAVAILABLE");
      let memory = createConditionMemory(turn.authenticatedUserId, [{ input, stored: null }]);
      memory = applyConditionChanges(memory, owner, { id: turn.turnId, text: "가입했어" },
        [{ slotId: conditionSlotId(input), status: "known", value: true, quote: "가입했어" }]);
      const result = { text: "답변", memory, modelCalls: 1, toolCalls: 1 };
      await options.commit(result); return result;
    },
    async closeSession() { closes++; },
  };
}

test("successful commits save once with the latest cookie and duplicate close shares the outcome", async () => {
  const runtime = fakeRuntime(), requests: ConditionSaveRequest[] = [], cookies: string[] = [];
  let release!: () => void;
  const saving = new Promise<void>(resolve => { release = resolve; });
  const chat = createChatService(runtime, { conditionSavePort: ({ getCookie }) => ({ async save(request) {
    requests.push(structuredClone(request)); cookies.push(getCookie()); await saving; return { status: "saved" };
  } }) });
  const sent = await chat.send({ clientRequestId: "turn-1", message: "가입했어" }, context());
  const first = chat.close(sent.conversationId, owner, "ECOTEAMSESSION=latest");
  const duplicate = chat.close(sent.conversationId, owner, "ECOTEAMSESSION=latest");
  release();
  assert.deepEqual(await first, { closed: true, saveStatus: "saved" });
  assert.deepEqual(await duplicate, { closed: true, saveStatus: "saved" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].changes[0].operation.kind, "set");
  assert.deepEqual(cookies, ["ECOTEAMSESSION=latest"]);
  assert.equal(runtime.closes, 1);
});

test("idle starts after completion, never while generating, and a late authentication cannot beat activity", async () => {
  const timers = new FakeTimers(), runtime = fakeRuntime();
  let releaseTurn!: () => void;
  const turnWait = new Promise<void>(resolve => { releaseTurn = resolve; });
  const original = runtime.runTurn;
  runtime.runTurn = async (...args: Parameters<typeof original>) => { await turnWait; return original(...args); };
  let releaseAuth!: (value: { userId: string }) => void;
  let authCalls = 0;
  const chat = createChatService(runtime, { idleMs: 90_000, clock: () => timers.now, timers,
    authenticate: async () => {
      authCalls++;
      if (authCalls === 1) return new Promise(resolve => { releaseAuth = resolve; });
      return { userId: owner };
    } });
  const pending = chat.send({ clientRequestId: "turn-1", message: "가입했어" }, context());
  timers.advance(100_000);
  assert.equal(runtime.closes, 0);
  releaseTurn();
  const sent = await pending;
  timers.advance(90_000);
  await Promise.resolve();
  assert.equal(authCalls, 1);
  await chat.keepAlive(sent.conversationId, owner, "ECOTEAMSESSION=renewed");
  releaseAuth({ userId: owner });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(runtime.closes, 0);
  timers.advance(90_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.closes, 1);
});

test("manual close during generation waits for the committed turn before saving and cleanup", async () => {
  const runtime = fakeRuntime(), requests: ConditionSaveRequest[] = [];
  const original = runtime.runTurn;
  let conversationId = "";
  const chat = createChatService(runtime, { conditionSavePort: context => {
    conversationId = context.conversationId;
    return { async save(request) { requests.push(structuredClone(request)); return { status: "saved" }; } };
  } });
  let releaseTurn!: () => void;
  const turnWait = new Promise<void>(resolve => { releaseTurn = resolve; });
  runtime.runTurn = async (...args: Parameters<typeof original>) => { await turnWait; return original(...args); };
  const sending = chat.send({ clientRequestId: "turn-race", message: "가입했어" }, context());
  await Promise.resolve();
  const closing = chat.close(conversationId, owner, "ECOTEAMSESSION=latest");
  await Promise.resolve();
  assert.equal(requests.length, 0);
  releaseTurn();
  await assert.rejects(sending, /상담이 끝났어요/);
  assert.deepEqual(await closing, { closed: true, saveStatus: "saved" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].changes[0].observation.turnId, "turn-race");
});

test("a later model failure saves prior successful changes and discards the conversation", async () => {
  const runtime = fakeRuntime(), requests: ConditionSaveRequest[] = [];
  const chat = createChatService(runtime, { conditionSavePort: () => ({ async save(request) {
    requests.push(structuredClone(request)); return { status: "saved" };
  } }) });
  const sent = await chat.send({ clientRequestId: "turn-1", message: "가입했어" }, context());
  runtime.fail = true;
  await assert.rejects(chat.send({ conversationId: sent.conversationId, clientRequestId: "turn-2", message: "실패" }, context()),
    /답변을 만들지 못했어요/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].changes[0].observation.turnId, "turn-1");
  assert.equal(runtime.closes, 1);
  await assert.rejects(chat.send({ conversationId: sent.conversationId, clientRequestId: "turn-3", message: "재개" }, context()),
    /상담이 끝났어요/);
});
