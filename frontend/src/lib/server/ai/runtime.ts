import "server-only";
import { readFile } from "node:fs/promises";
import { createSearchAnswerGraph } from "./graph.ts";
import { createEmbeddingClient } from "./embedding.ts";
import { createAnswerModel } from "./model.ts";
import { AiError } from "./contracts.ts";
import type { SearchTool } from "./contracts.ts";

export async function configuredEmbedding() {
  let token: string;
  try {
    token = (await readFile(process.env.AI_INTERNAL_TOKEN_FILE ?? "../.local/ai-internal-token", "utf8")).trim();
  } catch {
    throw new AiError("EMBEDDING_NOT_CONFIGURED");
  }
  return createEmbeddingClient({ baseUrl: process.env.EMBEDDING_BASE_URL ?? "http://127.0.0.1:18090", token });
}

// A caller must supply the application's authorized retrieval tool.
// No public chat endpoint or default SQL/ES access is introduced by this scaffold.
export async function createAiRuntime(search: SearchTool) {
  const embedding = await configuredEmbedding();
  return createSearchAnswerGraph({
    embed: embedding.embed,
    search,
    answer: createAnswerModel({ apiKey: process.env.OPENAI_API_KEY ?? "", model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini-2026-03-17" }),
  });
}
