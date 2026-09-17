import { randomUUID } from "node:crypto";
import { configuredEmbedding } from "@/lib/server/ai/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = randomUUID();
  let embedding: "UP" | "UNAVAILABLE" = "UNAVAILABLE";
  try {
    await (await configuredEmbedding()).health();
    embedding = "UP";
  } catch { /* Status only. Never include upstream error text or credentials. */ }
  const model = process.env.OPENAI_API_KEY?.trim() ? "CONFIGURED_UNVERIFIED" : "NOT_CONFIGURED";
  return Response.json({ data: { embedding, model, search: "NOT_CONNECTED" }, error: null, requestId }, {
    status: embedding === "UP" ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
