import { test } from "node:test";
import assert from "node:assert/strict";
import { createConversationRunner } from "../src/lib/server/ai/application/conversation-session.ts";
import { createConversationTools } from "../src/lib/server/ai/tools/conversation-tools.ts";
import { createCatalogTools } from "../src/lib/server/ai/tools/catalog-tools.ts";
import { createUserConditionLoader } from "../src/lib/server/ai/adapters/user-condition-context.ts";
import { createSpringClient } from "../src/lib/server/spring-client.ts";
import { conditionSlotId, createConditionMemory, readConditionFact } from "../src/lib/server/ai/application/condition-memory.ts";
import type { ConditionInput } from "../src/lib/server/ai/application/condition-memory.ts";
import type { ConversationProvider, HistoryMessage, ModelReply } from "../src/lib/server/ai/conversation-contracts.ts";

const owner = "00000000-0000-4000-8000-000000000001";
const turn = { authenticatedUserId: owner, turnId: "turn-1", text: "에코마일리지 가입했어", sessionHeaders: { Cookie: "ECOTEAMSESSION=synthetic" } };
const selected = { programKey: "P", actionId: "A" };
const input: ConditionInput = { inputKey: "membership.is_member", selector: { service_code: "eco_mileage" },
  target: { kind: "self", id: owner }, scope: { kind: "user" }, valueType: "boolean" };
const slotId = conditionSlotId(input);
const otherInput: ConditionInput = { inputKey: "household.member_count", selector: {},
  target: { kind: "self", id: owner }, scope: { kind: "user" }, valueType: "integer" };
const otherSlotId = conditionSlotId(otherInput);
const call = (name: string, args: unknown, n: number): ModelReply => ({ text: null, calls: [{ callId: `call-${n}`, name, arguments: JSON.stringify(args) }] });
function ports() {
  const requests: string[] = [];
  const config = { baseUrl: "http://spring.test", fetch: async (url: string | URL | Request, init?: RequestInit) => {
    const address = new URL(String(url)); requests.push(address.pathname);
    const id = new Headers(init?.headers).get("X-Request-Id");
    let data: unknown;
    if (address.pathname.endsWith("condition-context")) {
      assert.equal(new Headers(init?.headers).get("Cookie"), "ECOTEAMSESSION=synthetic");
      assert.equal(address.searchParams.has("userId"), false);
      data = { userId: owner, ...selected, eligibilityStatus: "not_evaluated", unselectedInputs: [], unmappedConditionIds: ["unmapped"], households: [],
        inputs: [{ ...input, target: { kind: "self", id: owner, householdId: null }, conditionIds: ["c1"],
          fact: { value: false, evidence: [{ observedAt: "2026-09-17T00:00:00Z", sourceKind: "user_statement", reference: null }] } },
        { ...otherInput, target: { kind: "self", id: owner, householdId: null }, conditionIds: ["c2"],
          fact: { value: 3, evidence: [{ observedAt: "2026-09-17T00:00:00Z", sourceKind: "user_statement", reference: null }] } }] };
    } else if (address.pathname.endsWith("/detail")) {
      data = { program_key: "P", action_id: "A", title: "에코마일리지", identity_basis: "explicit", program_status: null,
        program: {}, overview_sources: [], conditions: [], places: [], eligibility_status: "not_evaluated" };
    } else {
      data = { query: address.searchParams.get("query"), match_mode: "all_keywords_literal", limit: 10, offset: 0, has_more: false,
        items: [{ program_key: "P", action_id: "A", title: "에코마일리지", identity_basis: "explicit", program_status: null, catalog_district: null, condition_labels: [] }] };
    }
    return Response.json({ data, error: null, requestId: id }, { headers: { "X-Request-Id": id! } });
  } };
  return { catalog: createCatalogTools(createSpringClient(config)), load: createUserConditionLoader(config), requests };
}
function scripted(replies: ModelReply[]) {
  const restored: HistoryMessage[][] = [], closed: string[] = [], instructions: string[] = [];
  let count = 0;
  const provider: ConversationProvider = {
    create: async history => { restored.push(structuredClone(history)); return { id: `conv-${++count}`, responseIds: [] }; },
    respond: async (handle, _input, _tools, currentInstructions) => {
      instructions.push(currentInstructions);
      handle.responseIds.push(`resp-${handle.responseIds.length}`); const result = replies.shift(); assert.ok(result); return result;
    },
    close: async handle => { closed.push(handle.id); },
  };
  return { provider, restored, closed, instructions };
}
function personalTurn() {
  return [call("search_catalog", { query: "에코마일리지", limit: 10, offset: 0 }, 1),
    call("get_catalog_action", selected, 2), call("load_user_conditions", selected, 3),
    call("update_conditions", { changes: [{ slotId, status: "known", value: true, quote: "가입했어" }] }, 4),
    { text: "이 상담에서는 가입한 것으로 기억할게요.", calls: [] }];
}

test("catalog→details→DB seeds→quoted correction commit only after answer acceptance", async () => {
  const model = scripted([...personalTurn(),
    call("search_catalog", { query: "에코마일리지", limit: 10, offset: 0 }, 5),
    call("get_catalog_action", selected, 6), call("load_user_conditions", selected, 7),
    { text: "정정된 조건을 계속 사용했어요.", calls: [] }]), api = ports();
  const runner = createConversationRunner({ ...api, provider: model.provider }), session = runner.createSession(owner);
  let commits = 0;
  const result = await runner.runTurn(session, turn, { commit: async candidate => {
    commits++; assert.equal(session.memory.slots.length, 0);
    assert.equal(readConditionFact(candidate.memory, slotId).value, true);
    assert.equal(candidate.memory.slots[0].initial?.value, false);
  } });
  assert.equal(commits, 1); assert.equal(result.modelCalls, 5); assert.equal(result.toolCalls, 4);
  assert.equal(readConditionFact(session.memory, slotId).value, true);
  assert.equal(readConditionFact(session.memory, otherSlotId).value, 3);
  assert.match(model.instructions[3], /\"value\":false/);
  assert.match(model.instructions[4], /\"value\":true/);
  assert.equal(session.history.length, 2);
  await runner.runTurn(session, { ...turn, turnId: "turn-2", text: "조건 다시 확인해줘" }, { commit: async () => {} });
  assert.match(model.instructions[8], /\"value\":true/);
  assert.match(model.instructions[8], /household\.member_count/);
  assert.match(model.instructions[8], /\"value\":3/);
  assert.equal(readConditionFact(session.memory, slotId).value, true);
  assert.equal(readConditionFact(session.memory, otherSlotId).value, 3);
  assert.deepEqual(api.requests, [
    "/api/catalog/actions", "/api/catalog/actions/detail", "/api/profile/condition-context",
    "/api/catalog/actions", "/api/catalog/actions/detail", "/api/profile/condition-context",
  ]);
});

test("failed answer commit keeps memory/history and recreates provider from completed turns", async () => {
  const model = scripted(personalTurn()), api = ports();
  const runner = createConversationRunner({ ...api, provider: model.provider }), session = runner.createSession(owner);
  session.history = [{ role: "user", content: "이전 질문" }, { role: "assistant", content: "완료된 답변" }];
  const before = structuredClone({ memory: session.memory, history: session.history });
  await assert.rejects(runner.runTurn(session, turn, { commit: async () => { throw new Error("save failed"); } }), /save failed/);
  assert.match(model.instructions[4], /\"value\":true/);
  assert.deepEqual({ memory: session.memory, history: session.history }, before);
  assert.equal(session.provider, null); assert.deepEqual(model.closed, ["conv-1"]);
  model.provider.respond = async () => ({ text: "다시 답변", calls: [] });
  await runner.runTurn(session, { ...turn, turnId: "turn-2" }, { commit: async () => {} });
  assert.deepEqual(model.restored[1], before.history);
});

test("cleanup failure retains resource IDs and retries before reuse; explicit close ends session", async () => {
  const model = scripted([{ text: "답변", calls: [] }]);
  let attempts = 0;
  model.provider.close = async () => { if (++attempts === 1) throw new Error("offline"); };
  const runner = createConversationRunner({ ...ports(), provider: model.provider }), session = runner.createSession(owner);
  await assert.rejects(runner.runTurn(session, turn, { commit: async () => { throw new Error("save failed"); } }));
  assert.equal(session.retired.length, 1); assert.equal(session.provider, null);
  await runner.closeSession(session);
  assert.equal(attempts, 2); assert.equal(session.retired.length, 0);
  await assert.rejects(runner.runTurn(session, turn, { commit: async () => {} }), /CONVERSATION_CLOSED/);
});

test("wrong owner and pre-cancelled turns call no provider; same-session overlap is rejected", async () => {
  const model = scripted([]), api = ports();
  const runner = createConversationRunner({ ...api, provider: model.provider }), session = runner.createSession(owner);
  const options = { commit: async () => {} };
  await assert.rejects(runner.runTurn(session, { ...turn, authenticatedUserId: "other" }, options), /OWNER_MISMATCH/);
  await assert.rejects(runner.runTurn(session, turn, { ...options, signal: AbortSignal.abort() }));
  assert.equal(model.restored.length, 0);
  let release!: (reply: ModelReply) => void;
  const started = new Promise<void>(resolve => { model.provider.respond = async () => { resolve(); return new Promise(done => { release = done; }); }; });
  const first = runner.runTurn(session, turn, options); await started;
  await assert.rejects(runner.runTurn(session, turn, options), /CONVERSATION_BUSY/);
  await assert.rejects(runner.closeSession(session), /CONVERSATION_BUSY/);
  release({ text: "답변", calls: [] }); await first;
});

test("detail and personal tools require this turn's catalog IDs; bad quote never mutates candidate", async () => {
  const api = ports(), memory = createConditionMemory(owner, [{ input, stored: null }]);
  const tools = createConversationTools({ ...api, turn, memory });
  const signal = AbortSignal.timeout(5000);
  await assert.rejects(tools.execute("get_catalog_action", selected, signal), /CANDIDATE_REQUIRED/);
  await assert.rejects(tools.execute("load_user_conditions", selected, signal), /DETAIL_REQUIRED/);
  await assert.rejects(tools.execute("load_user_conditions", { ...selected, userId: "other" }, signal), /INVALID_TOOL_ARGUMENTS/);
  await assert.rejects(tools.execute("update_conditions", { changes: [{ slotId, status: "known", value: true, quote: "없는말" }] }, signal), /INVALID_CONDITION_UPDATE/);
  assert.deepEqual(tools.memory(), memory); assert.equal(api.requests.length, 0);
});
