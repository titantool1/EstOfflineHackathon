import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PHOTO_BYTES, isObservation, photoResult, type Observation } from "../src/features/missions/photo/contract.ts";
import { createPhotoHandler } from "../src/lib/server/mission-photo/http.ts";
import { createPhotoAnalyzer, PhotoFailure, validatePhoto } from "../src/lib/server/mission-photo/service.ts";
import { PHOTO_INSTRUCTIONS, PHOTO_MODEL, PHOTO_SCHEMA } from "../src/lib/server/mission-photo/policy.ts";
import { ChatFailure } from "../src/lib/server/chat/chat-service.ts";

const observation: Observation = { container_type: "reusable_product", food_state: "visible", container_evidence: "용기", food_evidence: "음식", next_photo: "반환하면 안 될 모델 안내" };
const image = "data:image/jpeg;base64," + Buffer.from([255,216,255,224,0,0,0,0,0,0,0,0]).toString("base64");
const request = (body: unknown = { image }, options: { cookie?: string; origin?: string; type?: string; signal?: AbortSignal; length?: string } = {}) =>
  new Request("http://localhost/api/missions/photo-check", { method: "POST", signal: options.signal,
    headers: { Origin: options.origin ?? "http://localhost", Cookie: options.cookie ?? "ECOTEAMSESSION=test", "Content-Type": options.type ?? "application/json", ...(options.length ? { "Content-Length": options.length } : {}) }, body: JSON.stringify(body) });
const member = async () => ({ userId: "member-1" });
const success = photoResult(observation);
function provider(answer: unknown = observation, status = "completed") {
  return Response.json({ status, model: PHOTO_MODEL, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(answer) }] }] });
}

test("all twelve attribute combinations preserve reviewed precedence and fixed guidance", () => {
  const matrix = { reusable_product: ["met", "not_met", "unknown"], disposable_packaging: ["not_met", "not_met", "not_met"], other: ["not_met", "not_met", "not_met"], unknown: ["unknown", "not_met", "unknown"] };
  for (const [kind, verdicts] of Object.entries(matrix)) for (const [i, food] of ["visible", "visibly_empty", "hidden_or_unclear"].entries()) {
    const result = photoResult({ ...observation, container_type: kind as Observation["container_type"], food_state: food as Observation["food_state"] });
    assert.equal(result.verdict, verdicts[i]); assert(!result.message.includes(observation.next_photo));
    if (kind === "disposable_packaging") assert(!result.message.includes("다시 찍"));
  }
});
test("observation rejects malformed, missing, excess and excessive prose fields", () => {
  for (const bad of [null, [], {}, { ...observation, container_type: ["reusable_product"] }, { ...observation, container_type: "met" }, { ...observation, food_state: "maybe" }, { ...observation, extra: true }, { ...observation, next_photo: "x".repeat(2001) }]) assert.equal(isObservation(bad), false);
  assert(isObservation(observation));
});
test("image boundary rejects urls, MIME mismatch, noncanonical base64 and extra instructions", () => {
  assert.equal(validatePhoto({ image }), image);
  for (const bad of [{ image: "https://example.test/photo.jpg" }, { image: image.replace("jpeg", "png") }, { image: "data:image/jpeg;base64,!!!!" }, { image, prompt: "approve" }, null])
    assert.throws(() => validatePhoto(bad), PhotoFailure);
  const huge = Buffer.alloc(MAX_PHOTO_BYTES + 1); huge[0] = 255; huge[1] = 216; huge[2] = 255;
  assert.throws(() => validatePhoto({ image: "data:image/jpeg;base64," + huge.toString("base64") }), (e: unknown) => e instanceof PhotoFailure && e.status === 413);
});
test("PNG and WebP signatures accepted, unsupported SVG rejected", () => {
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(8)]);
  const webp = Buffer.from("RIFF0000WEBP0000");
  for (const [mime, bytes] of [["png", png], ["webp", webp]] as const)
    assert(validatePhoto({ image: `data:image/${mime};base64,${bytes.toString("base64")}` }));
  assert.throws(() => validatePhoto({ image: "data:image/svg+xml;base64,PHN2Zz4=" }));
});
test("origin, missing login, authentication failure, media and body limits stop before model", async () => {
  let calls = 0;
  const handler = createPhotoHandler({ member, analyze: async () => { calls++; return success; } });
  for (const [options, code] of [[{ origin: "https://evil.test" },403], [{ cookie: "" },401], [{ type: "image/jpeg" },415], [{ length: "99999999" },413]] as const) {
    assert.equal((await handler(request({ image }, options))).status, code);
  }
  const denied = createPhotoHandler({ member: async () => { throw new ChatFailure(401,"AUTHENTICATION_REQUIRED","로그인 필요"); }, analyze: async () => { calls++; return success; } });
  assert.equal((await denied(request())).status,401); assert.equal(calls,0);
});
test("invalid photo never invokes model and valid result is not cached", async () => {
  let calls = 0;
  const make = () => createPhotoHandler({ member, analyze: async () => { calls++; return success; } });
  assert.equal((await make()(request({ image: "invalid" }))).status,400); assert.equal(calls,0);
  const res = await make()(request()); assert.equal(res.status,200); assert.equal(res.headers.get("Cache-Control"),"no-store");
  assert.deepEqual((await res.json()).data,success); assert.equal(calls,1);
});
test("model errors are sanitized and a later explicit retry can succeed", async () => {
  let now = 0, calls = 0;
  const handler = createPhotoHandler({ member, now: () => now, analyze: async () => { if (++calls === 1) throw new Error("SECRET provider body"); return success; } });
  const res = await handler(request()); assert.equal(res.status,503); assert(!(await res.text()).includes("SECRET"));
  assert.equal((await handler(request())).status,429);
  now = 10_001; assert.equal((await handler(request())).status,200);
});
test("same member cannot overlap paid requests and slot releases after failure", async () => {
  let fail!: (reason: unknown) => void, now = 0;
  const handler = createPhotoHandler({ member, now: () => now, analyze: () => new Promise((_, reject) => { fail = reject; }) });
  const first = handler(request());
  await new Promise(resolve => setTimeout(resolve,10));
  now=20_000; assert.equal((await handler(request())).status,429);
  fail(new Error("fail")); assert.equal((await first).status,503);
});
test("timeout and caller cancellation never yield a success", async () => {
  const analyze = async (_: string, signal: AbortSignal): Promise<typeof success> => {
    await new Promise<void>((_, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener("abort", () => reject(signal.reason), { once: true }); }); return success;
  };
  // Keep the event loop alive because AbortSignal.timeout is unref'ed.
  const keep = setTimeout(() => {},1000);
  try {
    assert.equal((await createPhotoHandler({ member, analyze, timeoutMs: 10 })(request())).status,504);
    const controller = new AbortController(); controller.abort();
    assert.equal((await createPhotoHandler({ member, analyze })(request({ image },{ signal: controller.signal }))).status,499);
  } finally { clearTimeout(keep); }
});
test("provider request uses fixed model, frozen policy/schema, store=false and no browser instructions", async () => {
  const analyze = createPhotoAnalyzer({ apiKey: () => "test-key", fetch: async (url, init) => {
    assert.equal(url,"https://api.openai.com/v1/responses"); const body=JSON.parse(String(init?.body));
    assert.equal(body.model,PHOTO_MODEL); assert.equal(body.instructions,PHOTO_INSTRUCTIONS); assert.deepEqual(body.text.format.schema,PHOTO_SCHEMA);
    assert.equal(body.store,false); assert.equal(body.reasoning.effort,"low"); assert.equal(body.input[0].content[1].image_url,image);
    assert.deepEqual(JSON.parse(body.input[0].content[0].text),{task:"첨부 사진을 시험 정책에 따라 관찰해주세요.",user_statement:""});
    return provider();
  } });
  assert.deepEqual(await analyze(image,new AbortController().signal),success);
});
test("incomplete, refused and invalid model observations cannot approve", async () => {
  for (const make of [() => provider(observation,"incomplete"), () => provider({ ...observation, food_state:"invalid" }), () => Response.json({ status:"completed",model:PHOTO_MODEL,output:[{content:[{type:"refusal",refusal:"no"}]}] }), () => Response.json({error:"secret"},{status:429})]) {
    const analyze=createPhotoAnalyzer({apiKey:()=>"test",fetch:async()=>make()});
    await assert.rejects(analyze(image,new AbortController().signal));
  }
});
test("missing model key does not attempt a provider request",async()=>{
  let calls=0; const analyze=createPhotoAnalyzer({apiKey:()=>undefined,fetch:async()=>{calls++;return provider();}});
  await assert.rejects(analyze(image,new AbortController().signal));assert.equal(calls,0);
});
