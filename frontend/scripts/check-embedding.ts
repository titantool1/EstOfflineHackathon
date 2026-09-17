// Explicit local embedding probe. No OpenAI/model answer request is made.
import assert from "node:assert/strict";
import { configuredEmbedding } from "../src/lib/server/ai/runtime.ts";
const client = await configuredEmbedding();
const metadata = await client.health();
const vector = await client.embed("서울에서 텀블러 사용하기", AbortSignal.timeout(60_000));
assert.equal(vector.length, 1024);
console.log(JSON.stringify({ result: "pass", ...metadata, vectorLength: vector.length,
  norm: Math.hypot(...vector), externalModelCalls: 0 }));
