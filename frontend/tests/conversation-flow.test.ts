import assert from "node:assert/strict";
import test from "node:test";
import { createConversationGraph } from "../src/lib/server/ai/application/conversation-flow.ts";
import { AiError } from "../src/lib/server/ai/contracts.ts";
import type {
  ConversationHandle,
  FunctionDefinition,
  ModelInput,
  ModelReply,
} from "../src/lib/server/ai/conversation-contracts.ts";

const conversation: ConversationHandle = { id: "conversation-1", responseIds: [] };
const tools: FunctionDefinition[] = [{
  type: "function",
  name: "search_catalog",
  description: "search",
  strict: true,
  parameters: { type: "object", additionalProperties: false },
}];

function input(execute: (name: string, args: unknown, signal: AbortSignal) => Promise<unknown> = async () => ({ status: "ok" })) {
  return { conversation, text: "텀블러 혜택 알려줘", turnId: "turn-7", instructions: "answer", tools, execute };
}

function provider(replies: Array<ModelReply | ((items: ModelInput[]) => ModelReply)>) {
  const inputs: ModelInput[][] = [];
  return {
    inputs,
    async respond(_conversation: ConversationHandle, items: ModelInput[]) {
      inputs.push(items);
      const reply = replies.shift();
      assert.ok(reply, "unexpected model call");
      return typeof reply === "function" ? reply(items) : reply;
    },
  };
}

function call(callId: string, argumentsText = "{}", name = "search_catalog"): ModelReply {
  return { text: null, calls: [{ callId, name, arguments: argumentsText }] };
}

function final(text = "확인했어요."): ModelReply {
  return { text, calls: [] };
}

async function rejectsCode(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof AiError && error.code === code);
}

test("ordinary dialogue completes without a tool call", async () => {
  const fake = provider([final("  바로 답변  ")]);
  const run = createConversationGraph(fake);
  const result = await run(input(), new AbortController().signal);
  assert.deepEqual(result, { text: "바로 답변", modelCalls: 1, toolCalls: 0 });
  assert.deepEqual(fake.inputs, [[{ role: "user", content: "[user-turn:turn-7]\n텀블러 혜택 알려줘" }]]);
});

test("stream events show only public progress and reset provisional text before a tool", async () => {
  const events: unknown[] = [];
  let modelCalls = 0;
  const fake = { respond: async (_handle: ConversationHandle, _items: ModelInput[], _tools: FunctionDefinition[],
    _instructions: string, _signal: AbortSignal, onTextDelta?: (text: string) => void) => {
    if (++modelCalls === 1) {
      onTextDelta?.("확인 중 비밀 아님");
      return call("call-secret", '{"query":"member-private-value"}');
    }
    onTextDelta?.("최종 답변");
    return final("최종 답변");
  } };
  const result = await createConversationGraph(fake)({ ...input(), onEvent: event => events.push(event) }, new AbortController().signal);
  assert.deepEqual(result, { text: "최종 답변", modelCalls: 2, toolCalls: 1 });
  assert.deepEqual(events, [
    { type: "reset" }, { type: "progress", stage: "thinking" },
    { type: "progress", stage: "answering" }, { type: "delta", text: "확인 중 비밀 아님" },
    { type: "reset" }, { type: "progress", stage: "searching" },
    { type: "reset" }, { type: "progress", stage: "thinking" },
    { type: "progress", stage: "answering" }, { type: "delta", text: "최종 답변" },
  ]);
  assert.doesNotMatch(JSON.stringify(events), /member-private-value|call-secret|search_catalog/);
});

test("streamed provisional text is bounded independently of the final response", async () => {
  const fake = { respond: async (_handle: ConversationHandle, _items: ModelInput[], _tools: FunctionDefinition[],
    _instructions: string, _signal: AbortSignal, onTextDelta?: (text: string) => void) => {
    onTextDelta?.("x".repeat(6001));
    return final("짧은 답변");
  } };
  await rejectsCode(createConversationGraph(fake)({ ...input(), onEvent: () => {} }, new AbortController().signal), "INVALID_MODEL_OUTPUT");
});

test("tool output keeps the exact call id and preserves no_results", async () => {
  const noResults = { status: "no_results", items: [] };
  const fake = provider([
    call("call-17", '{"query":"텀블러"}'),
    (items) => {
      assert.deepEqual(items, [{ type: "function_call_output", call_id: "call-17", output: JSON.stringify(noResults) }]);
      return final("자료가 없어요.");
    },
  ]);
  const seen: unknown[] = [];
  const result = await createConversationGraph(fake)(input(async (_name, args) => {
    seen.push(args);
    return noResults;
  }), new AbortController().signal);
  assert.deepEqual(seen, [{ query: "텀블러" }]);
  assert.deepEqual(result, { text: "자료가 없어요.", modelCalls: 2, toolCalls: 1 });
});

test("unoffered tools, duplicate call ids, and multiple calls are rejected", async () => {
  let executions = 0;
  await rejectsCode(createConversationGraph(provider([call("x", "{}", "private_tool")]))(
    input(async () => { executions++; }), new AbortController().signal), "TOOL_NOT_AVAILABLE");
  assert.equal(executions, 0);

  const duplicate = provider([call("same"), call("same")]);
  await rejectsCode(createConversationGraph(duplicate)(input(async () => { executions++; return {}; }),
    new AbortController().signal), "DUPLICATE_TOOL_CALL_ID");
  assert.equal(executions, 1);

  const multiple = provider([{ text: null, calls: [call("a").calls[0], call("b").calls[0]] }]);
  await rejectsCode(createConversationGraph(multiple)(input(), new AbortController().signal), "INVALID_MODEL_OUTPUT");
});

test("the loop stops at six model calls and five tool executions", async () => {
  let executions = 0;
  const fake = provider(Array.from({ length: 6 }, (_, index) => call(`limit-${index + 1}`)));
  await rejectsCode(createConversationGraph(fake)(input(async () => { executions++; return { status: "ok" }; }),
    new AbortController().signal), "TOOL_CALL_LIMIT");
  assert.equal(fake.inputs.length, 6);
  assert.equal(executions, 5);
});

test("tool JSON and execution failures are sanitized and the model can recover", async () => {
  const fake = provider([
    call("bad-json", "{"),
    (items) => {
      assert.deepEqual(JSON.parse((items[0] as { output: string }).output),
        { status: "error", error: { code: "INVALID_TOOL_ARGUMENTS" } });
      return call("coded-tool", "{}");
    },
    (items) => {
      const output = (items[0] as { output: string }).output;
      assert.deepEqual(JSON.parse(output), { status: "error", error: { code: "CATALOG_UNAVAILABLE" } });
      assert.doesNotMatch(output, /private upstream detail/);
      return call("failed-tool", "{}");
    },
    (items) => {
      const output = (items[0] as { output: string }).output;
      assert.deepEqual(JSON.parse(output), { status: "error", error: { code: "TOOL_FAILED" } });
      assert.doesNotMatch(output, /database password leaked/);
      return final("다른 방법을 안내할게요.");
    },
  ]);
  let executions = 0;
  const result = await createConversationGraph(fake)(input(async () => {
    executions++;
    if (executions === 1) throw { code: "CATALOG_UNAVAILABLE", message: "private upstream detail" };
    throw new Error("database password leaked");
  }), new AbortController().signal);
  assert.equal(executions, 2);
  assert.deepEqual(result, { text: "다른 방법을 안내할게요.", modelCalls: 4, toolCalls: 3 });
});

test("cancellation prevents initial and subsequent calls", async () => {
  const before = provider([final()]);
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await rejectsCode(createConversationGraph(before)(input(), alreadyCancelled.signal), "AI_CANCELLED");
  assert.equal(before.inputs.length, 0);

  const during = new AbortController();
  const fake = provider([call("cancelled"), final("must not run")]);
  let executions = 0;
  await rejectsCode(createConversationGraph(fake)(input(async () => {
    executions++;
    during.abort();
    throw new Error("secret cancellation detail");
  }), during.signal), "AI_CANCELLED");
  assert.equal(executions, 1);
  assert.equal(fake.inputs.length, 1);

  const explicit = provider([call("explicit-cancel"), final("must not run")]);
  await rejectsCode(createConversationGraph(explicit)(input(async () => {
    throw new AiError("AI_CANCELLED");
  }), new AbortController().signal), "AI_CANCELLED");
  assert.equal(explicit.inputs.length, 1);
});

test("input and final response boundaries reject abnormal data", async () => {
  const run = createConversationGraph(provider([final()]));
  await rejectsCode(run({ ...input(), text: " " }, new AbortController().signal), "INVALID_INPUT");
  await rejectsCode(run({ ...input(), turnId: "x".repeat(101) }, new AbortController().signal), "INVALID_INPUT");
  await rejectsCode(createConversationGraph(provider([{ text: "", calls: [] }]))(
    input(), new AbortController().signal), "INVALID_MODEL_OUTPUT");
  await rejectsCode(createConversationGraph(provider([final("x".repeat(6001))]))(
    input(), new AbortController().signal), "INVALID_MODEL_OUTPUT");
});

test("service failure gets one final response with tools disabled, never a query rewrite", async () => {
  const offered: number[] = [];
  let executions = 0;
  const result = await createConversationGraph({ respond: async (_handle, items, definitions, instructions) => {
    offered.push(definitions.length);
    if (definitions.length) return call(`search-${offered.length}`);
    const failure = JSON.parse((items[0] as { output: string }).output);
    assert.deepEqual(failure, { status: "error", error: { code: "CATALOG_SEARCH_UPSTREAM_FAILED" }, retryable_in_turn: false });
    assert.match(instructions, /검색 결과가 0건/);
    assert.doesNotMatch(JSON.stringify(items), /private upstream detail/);
    return final("검색 서비스 연결 문제로 지금은 확인하지 못했어요.");
  } })(input(async () => {
    executions++;
    throw { code: "CATALOG_SEARCH_UPSTREAM_FAILED", message: "private upstream detail" };
  }), new AbortController().signal);
  assert.deepEqual(offered, [1, 0]);
  assert.equal(executions, 1);
  assert.equal(result.modelCalls, 2);
  assert.equal(result.toolCalls, 1);
});

test("known embedding/protocol failures and unknown server statuses end tool use", async () => {
  for (const error of [
    { code: "EMBEDDING_NOT_CONFIGURED" }, { code: "EMBEDDING_UNAVAILABLE" }, { code: "INVALID_EMBEDDING_RESPONSE" },
    { code: "INVALID_BACKEND_REQUEST", status: 400 }, { code: "BACKEND_CLIENT_CONFIG_ERROR" }, { code: "BACKEND_INVALID_RESPONSE" }, { code: "BACKEND_TIMEOUT" },
    { code: "BACKEND_UNAVAILABLE" }, { code: "CATALOG_SEARCH_RESPONSE_INVALID" }, { code: "CATALOG_SEARCH_PARTIAL" },
    { code: "DATABASE_UNAVAILABLE" }, { code: "FUTURE_UPSTREAM_FAILURE", status: 502 },
    { code: "RATE_LIMITED", status: 429 }, { code: "AUTHENTICATION_REQUIRED", status: 401 }, { code: "ACCESS_DENIED", status: 403 },
  ]) {
    let calls = 0;
    const graph = createConversationGraph({ respond: async (_h, _i, definitions) => {
      if (++calls === 1) return call("first");
      assert.deepEqual(definitions, [], JSON.stringify(error));
      return final("조회 실패");
    } });
    await graph(input(async () => { throw error; }), new AbortController().signal);
    assert.equal(calls, 2);
  }
});

test("no_results and repairable 400 keep tools available", async () => {
  for (const mode of ["empty", "bad-request"] as const) {
    let calls = 0, executions = 0;
    const graph = createConversationGraph({ respond: async (_h, _i, definitions) => {
      assert.equal(definitions.length, 1);
      return ++calls < 3 ? call(`call-${calls}`) : final("수정해 조회했어요.");
    } });
    await graph(input(async () => {
      if (++executions === 1 && mode === "bad-request") throw { code: "CATALOG_SEARCH_REQUEST_INVALID", status: 400 };
      return { status: "no_results", items: [] };
    }), new AbortController().signal);
    assert.equal(executions, 2);
  }
});

test("provider violating tools-disabled completion cannot execute another tool", async () => {
  let executions = 0;
  await rejectsCode(createConversationGraph(provider([call("first"), call("forbidden")]))(
    input(async () => { executions++; throw { code: "BACKEND_TIMEOUT" }; }),
    new AbortController().signal), "INVALID_MODEL_OUTPUT");
  assert.equal(executions, 1);
});
