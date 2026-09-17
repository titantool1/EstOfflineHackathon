import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchAnswerGraph } from "../src/lib/server/ai/graph.ts";
import { createEmbeddingClient, EMBEDDING } from "../src/lib/server/ai/embedding.ts";
import { createAnswerModel } from "../src/lib/server/ai/model.ts";

const vector = [1, ...Array(1023).fill(0)];
const evidence = [{ id: "test:1", text: "시험 근거" }];
const signal = () => AbortSignal.timeout(5000);

test("real LangGraph passes the query/vector/evidence through the ports", async () => {
  const calls: string[] = [];
  const run = createSearchAnswerGraph({
    embed: async (query) => { assert.equal(query, "텀블러"); calls.push("embed"); return vector; },
    search: async (query, received) => { assert.equal(query, "텀블러"); assert.deepEqual(received, vector); calls.push("search"); return evidence; },
    answer: async (_query, received) => { assert.deepEqual(received, evidence); calls.push("answer"); return "시험 답변"; },
  });
  assert.deepEqual(await run(" 텀블러 "), { answer: "시험 답변", evidence });
  assert.deepEqual(calls, ["embed", "search", "answer"]);
});

test("no search results skip the model", async () => {
  const run = createSearchAnswerGraph({ embed: async () => vector, search: async () => [],
    answer: async () => { assert.fail("must not invoke model"); } });
  assert.deepEqual((await run("질문")).evidence, []);
});

test("search failure and invalid input stop before the model", async () => {
  const run = createSearchAnswerGraph({ embed: async () => vector,
    search: async () => { throw new Error("search down"); },
    answer: async () => { assert.fail("must not invoke model"); } });
  await assert.rejects(run("질문"), /search down/);
  await assert.rejects(run("  "), /INVALID_QUERY/);
});

test("cancelled graph invokes no ports", async () => {
  const never = async () => { assert.fail("cancelled port invoked"); };
  await assert.rejects(createSearchAnswerGraph({ embed: never, search: never, answer: never })("질문", AbortSignal.abort()));
});

test("embedding adapter passes authentication and checks the pinned vector contract", async () => {
  const client = createEmbeddingClient({ baseUrl: "http://embedding.invalid", token: "test-only-token",
    fetch: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("X-Eco-Internal-Token"), "test-only-token");
      assert.deepEqual(JSON.parse(String(init?.body)), { texts: ["텀블러"] });
      return Response.json({ ...EMBEDDING, vectors: [vector] });
    } });
  assert.deepEqual(await client.embed("텀블러", signal()), vector);
  for (const override of [{ dimension: 3 }, { revision: "wrong" }, { normalized: false },
    { vectors: [[1]] }, { vectors: [Array(1024).fill(1)] }, { vectors: [Array(1024).fill(null)] }]) {
    const bad = createEmbeddingClient({ baseUrl: "http://embedding.invalid", token: "test",
      fetch: async () => Response.json({ ...EMBEDDING, vectors: [vector], ...override }) });
    await assert.rejects(bad.embed("질문", signal()), /INVALID_EMBEDDING_RESPONSE/);
  }
});

test("missing model key never calls the provider", async () => {
  const answer = createAnswerModel({ apiKey: "", model: "test-only",
    fetch: async () => { assert.fail("must not call provider"); } });
  await assert.rejects(answer("질문", evidence, signal()), /MODEL_NOT_CONFIGURED/);
});

test("OpenAI SDK adapter uses nonstored bounded responses with no real network", async () => {
  const answer = createAnswerModel({ apiKey: "test-only-key", model: "test-only-model", fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.model, "test-only-model");
    assert.equal(body.max_output_tokens, 800);
    assert.deepEqual(JSON.parse(body.input), { query: "질문", evidence });
    return Response.json({ id: "resp_test", object: "response", status: "completed",
      output: [{ type: "message", id: "msg_test", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "시험 답변", annotations: [] }] }] });
  } });
  assert.equal(await answer("질문", evidence, signal()), "시험 답변");
});

test("provider failure is sanitized with no automatic retry; incomplete is rejected", async () => {
  let calls = 0;
  const failed = createAnswerModel({ apiKey: "test", model: "test", fetch: async () => {
    calls++; return Response.json({ error: { message: "private provider detail" } }, { status: 500 });
  } });
  await assert.rejects(failed("질문", evidence, signal()), /MODEL_UNAVAILABLE/);
  assert.equal(calls, 1);
  const incomplete = createAnswerModel({ apiKey: "test", model: "test", fetch: async () =>
    Response.json({ id: "resp_test", object: "response", status: "incomplete", output: [] }) });
  await assert.rejects(incomplete("질문", evidence, signal()), /MODEL_INCOMPLETE/);
});
