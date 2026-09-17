import { test } from "node:test";
import assert from "node:assert/strict";
import { createConversationProvider } from "../src/lib/server/ai/adapters/openai-conversation.ts";

const signal = () => AbortSignal.timeout(5000);
const reply = (overrides = {}) => ({ id: "resp_1", object: "response", status: "completed", output: [
  { type: "function_call", id: "fc_1", call_id: "call_1", name: "search_catalog", arguments: '{"query":"텀블러"}', status: "completed" },
], ...overrides });

const sse = (event: Record<string, unknown>) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const textResponse = (text: string, status: "in_progress" | "completed") => reply({
  status,
  output_text: text,
  output: [{ type: "message", id: "msg_1", role: "assistant", status,
    content: [{ type: "output_text", text, annotations: [], logprobs: [] }] }],
});

test("SDK reuses Conversation, passes exact tool output and tracks response IDs", async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = createConversationProvider({ apiKey: "fake", model: "test-model", fetch: async (url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    if (String(url).endsWith("/conversations")) return Response.json({ id: "conv_1", object: "conversation", created_at: 1, metadata: {} });
    assert.equal(body.conversation, "conv_1"); assert.equal(body.store, true);
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.stream, undefined);
    assert.equal(body.tool_choice, "none"); assert.equal(body.model, "test-model");
    return Response.json(reply());
  } });
  const handle = await provider.create([{ role: "user", content: "완료된 질문" }, { role: "assistant", content: "완료된 답변" }], signal());
  const result = await provider.respond(handle, [{ type: "function_call_output", call_id: "previous_call", output: '{"status":"no_results"}' }], [], "test", signal());
  assert.equal((bodies[0].items as unknown[]).length, 2);
  assert.deepEqual(bodies[1].input, [{ type: "function_call_output", call_id: "previous_call", output: '{"status":"no_results"}' }]);
  assert.deepEqual(result.calls, [{ callId: "call_1", name: "search_catalog", arguments: '{"query":"텀블러"}' }]);
  assert.deepEqual(handle.responseIds, ["resp_1"]);
});

test("incomplete responses remain tracked; SDK errors are sanitized with no retries", async () => {
  let calls = 0;
  const failed = createConversationProvider({ apiKey: "fake", model: "test", fetch: async () => {
    calls++; return Response.json({ error: { message: "private upstream detail" } }, { status: 500 });
  } });
  await assert.rejects(failed.create([], signal()), /MODEL_UNAVAILABLE/);
  assert.equal(calls, 1);
  const incomplete = createConversationProvider({ apiKey: "fake", model: "test", fetch: async () => Response.json(reply({ status: "incomplete" })) });
  const handle = { id: "conv_1", responseIds: [] as string[] };
  await assert.rejects(incomplete.respond(handle, [], [], "", signal()), /MODEL_INCOMPLETE/);
  assert.deepEqual(handle.responseIds, ["resp_1"]);
  const missing = createConversationProvider({ apiKey: "", model: "test", fetch: async () => { assert.fail("no request"); } });
  await assert.rejects(missing.create([], signal()), /MODEL_NOT_CONFIGURED/);
});

test("streaming exposes text deltas before completion and tracks the response as soon as it is created", async () => {
  const encoder = new TextEncoder();
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const response = textResponse("먼저 보여요", "completed");
  const provider = createConversationProvider({ apiKey: "fake", model: "test", fetch: async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream, true);
    return new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(sse({ type: "response.created", sequence_number: 0,
          response: textResponse("", "in_progress") })));
        controller.enqueue(encoder.encode(sse({ type: "response.output_text.delta", sequence_number: 1,
          output_index: 0, content_index: 0, item_id: "msg_1", delta: "먼저 ", logprobs: [] })));
        await released;
        controller.enqueue(encoder.encode(sse({ type: "response.output_text.delta", sequence_number: 2,
          output_index: 0, content_index: 0, item_id: "msg_1", delta: "보여요", logprobs: [] })));
        controller.enqueue(encoder.encode(sse({ type: "response.completed", sequence_number: 3, response })));
        controller.close();
      },
    }), { headers: { "Content-Type": "text/event-stream" } });
  } });
  const handle = { id: "conv_1", responseIds: [] as string[] }, deltas: string[] = [];
  let first!: () => void;
  const firstDelta = new Promise<void>(resolve => { first = resolve; });
  const pending = provider.respond(handle, [], [], "", signal(), text => { deltas.push(text); first(); });
  await firstDelta;
  assert.deepEqual(deltas, ["먼저 "]);
  assert.deepEqual(handle.responseIds, ["resp_1"]);
  release();
  assert.deepEqual(await pending, { text: "먼저 보여요", calls: [] });
  assert.deepEqual(deltas, ["먼저 ", "보여요"]);
  assert.deepEqual(handle.responseIds, ["resp_1"]);
});

test("stream cancellation after creation keeps the response ID available for cleanup", async () => {
  const encoder = new TextEncoder(), abort = new AbortController();
  const response = textResponse("", "in_progress");
  const provider = createConversationProvider({ apiKey: "fake", model: "test", fetch: async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse({ type: "response.created", sequence_number: 0, response })));
      controller.enqueue(encoder.encode(sse({ type: "response.output_text.delta", sequence_number: 1,
        output_index: 0, content_index: 0, item_id: "msg_1", delta: "일부", logprobs: [] })));
    },
  }), { headers: { "Content-Type": "text/event-stream" } }) });
  const handle = { id: "conv_1", responseIds: [] as string[] };
  await assert.rejects(provider.respond(handle, [], [], "", abort.signal, () => abort.abort()), /AI_CANCELLED/);
  assert.deepEqual(handle.responseIds, ["resp_1"]);
});

test("an incomplete stream remains tracked and cannot be accepted as a reply", async () => {
  const encoder = new TextEncoder(), response = { ...textResponse("일부", "in_progress"), status: "incomplete" };
  const provider = createConversationProvider({ apiKey: "fake", model: "test", fetch: async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse({ type: "response.created", sequence_number: 0,
        response: textResponse("", "in_progress") })));
      controller.enqueue(encoder.encode(sse({ type: "response.incomplete", sequence_number: 1, response })));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }) });
  const handle = { id: "conv_1", responseIds: [] as string[] };
  await assert.rejects(provider.respond(handle, [], [], "", signal(), () => {}), /MODEL_INCOMPLETE/);
  assert.deepEqual(handle.responseIds, ["resp_1"]);
});

test("cleanup deletes items before conversation and also deletes responses, tolerating 404", async () => {
  const calls: string[] = [];
  const provider = createConversationProvider({ apiKey: "fake", model: "test", fetch: async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push(`${init?.method} ${path}`);
    if (init?.method === "GET") return Response.json({ object: "list", data: [{ id: "item_1" }], has_more: false, first_id: "item_1", last_id: "item_1" });
    if (path.includes("/responses/")) return Response.json({ error: { message: "missing" } }, { status: 404 });
    return Response.json({ id: "deleted", deleted: true });
  } });
  await provider.close({ id: "conv_1", responseIds: ["resp_1"] }, signal());
  assert.deepEqual(calls, ["GET /v1/conversations/conv_1/items", "DELETE /v1/conversations/conv_1/items/item_1",
    "DELETE /v1/conversations/conv_1", "DELETE /v1/responses/resp_1"]);
});

test("missing item ID leaves cleanup pending instead of discarding the conversation", async () => {
  const deleted: string[] = [];
  const provider = createConversationProvider({ apiKey: "fake", model: "test", fetch: async (url, init) => {
    if (init?.method === "GET") return Response.json({ object: "list", data: [{ type: "message" }], has_more: false });
    deleted.push(new URL(String(url)).pathname);
    return Response.json({ deleted: true });
  } });
  await assert.rejects(provider.close({ id: "conv_1", responseIds: ["resp_1"] }, signal()), /CONVERSATION_CLEANUP_PENDING/);
  assert.deepEqual(deleted, ["/v1/responses/resp_1"]);
});
