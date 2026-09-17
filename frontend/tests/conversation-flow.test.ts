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
