import "server-only";
import { AiError } from "../contracts.ts";

export const EMBEDDING = {
  model: "BAAI/bge-m3", revision: "5617a9f61b028005a4858fdac845db406aefb181",
  dimension: 1024, normalized: true, max_sequence_length: 512,
} as const;

function metadataMatches(body: Record<string, unknown>) {
  return Object.entries(EMBEDDING).every(([key, value]) => body[key] === value);
}

export function createEmbeddingClient(options: { baseUrl: string; token: string; fetch?: typeof fetch }) {
  const fetcher = options.fetch ?? fetch;
  async function request(path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!options.token.trim()) throw new AiError("EMBEDDING_NOT_CONFIGURED");
    try {
      const response = await fetcher(new URL(path, options.baseUrl), {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "X-Eco-Internal-Token": options.token },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.any([AbortSignal.timeout(body === undefined ? 3000 : 60_000), ...(signal ? [signal] : [])]),
      });
      if (!response.ok) throw new AiError("EMBEDDING_UNAVAILABLE");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !metadataMatches(payload as Record<string, unknown>)) {
        throw new AiError("INVALID_EMBEDDING_RESPONSE");
      }
      return payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AiError) throw error;
      throw new AiError(signal?.aborted ? "AI_CANCELLED" : "EMBEDDING_UNAVAILABLE");
    }
  }
  return {
    async health() {
      const body = await request("/health");
      if (body.status !== "UP") throw new AiError("EMBEDDING_UNAVAILABLE");
      return EMBEDDING;
    },
    async embed(query: string, signal: AbortSignal) {
      if (!query.trim() || query.length > 2000) throw new AiError("INVALID_QUERY");
      const body = await request("/embed", { texts: [query] }, signal);
      const vectors = body.vectors;
      if (!Array.isArray(vectors) || vectors.length !== 1 || !Array.isArray(vectors[0])
          || vectors[0].length !== EMBEDDING.dimension || !vectors[0].every((value: unknown) => typeof value === "number" && Number.isFinite(value))
          || Math.abs(Math.hypot(...vectors[0]) - 1) > 0.001) throw new AiError("INVALID_EMBEDDING_RESPONSE");
      return vectors[0] as number[];
    },
  };
}
