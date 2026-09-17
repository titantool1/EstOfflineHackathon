import { createConversationProvider } from "./adapters/openai-conversation.ts";
import { createConversationRunner } from "./application/conversation-session.ts";
import { createPlaceTools } from "./tools/place-tools.ts";
import { createCatalogTools } from "./tools/catalog-tools.ts";
import { createUserConditionLoader } from "./adapters/user-condition-context.ts";
import { createSpringClient } from "../spring-client.ts";
import "server-only";
import { readFile } from "node:fs/promises";
import { createSearchAnswerGraph } from "./application/search-answer-flow.ts";
import { createEmbeddingClient } from "./adapters/embedding-client.ts";
import { createAnswerModel } from "./adapters/openai-answer-model.ts";
import { AiError } from "./contracts.ts";
import type { SearchTool } from "./tools/contracts.ts";

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

// New conversational path. The existing fixed search graph remains available during API migration.
export async function createConversationRuntime() {
  const baseUrl = process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080";
  return createConversationRunner({
    provider: createConversationProvider({ apiKey: process.env.OPENAI_API_KEY ?? "", model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini-2026-03-17" }),
    catalog: createCatalogTools(createSpringClient({ baseUrl }), async (query, signal) => {
      const embedding = await configuredEmbedding();
      return embedding.embed(query, signal);
    }),
    load: createUserConditionLoader({ baseUrl }),
    places: createPlaceTools(createSpringClient({ baseUrl })),
  });
}
