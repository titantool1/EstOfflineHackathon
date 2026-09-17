import { isNeighborhoodView, isResolveResult, type Neighborhood } from "./neighborhood-contract.ts";

type Envelope<T> = { data: T | null; error: { code: string; message: string } | null; requestId: string };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export class NeighborhoodClientError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; }
}

async function response<T>(reply: Response, validate: (data: unknown) => data is T): Promise<T> {
  let envelope: unknown;
  try { envelope = await reply.json(); } catch { throw new NeighborhoodClientError("INVALID_RESPONSE", "응답을 확인하지 못했어요.", 503); }
  if (!record(envelope) || typeof envelope.requestId !== "string")
    throw new NeighborhoodClientError("INVALID_RESPONSE", "응답을 확인하지 못했어요.", 503);
  const typed = envelope as Envelope<unknown>;
  if (!reply.ok) {
    if (!record(typed.error) || typeof typed.error.code !== "string" || typeof typed.error.message !== "string")
      throw new NeighborhoodClientError("INVALID_RESPONSE", "응답을 확인하지 못했어요.", 503);
    throw new NeighborhoodClientError(typed.error.code, typed.error.message, reply.status);
  }
  if (typed.error !== null || !validate(typed.data))
    throw new NeighborhoodClientError("INVALID_RESPONSE", "응답을 확인하지 못했어요.", 503);
  return typed.data;
}

export function createNeighborhoodClient(fetcher: typeof fetch = fetch) {
  return {
    async get(signal?: AbortSignal) {
      return (await response(await fetcher("/api/profile/neighborhood", { signal, cache: "no-store" }), isNeighborhoodView)).neighborhood;
    },
    async resolve(input: { query: string } | { latitude: number; longitude: number }, signal?: AbortSignal) {
      return response(await fetcher("/api/profile/neighborhood/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
      }), isResolveResult);
    },
    async save(neighborhood: Neighborhood) {
      const csrf = await response(await fetcher("/api/auth/csrf", { cache: "no-store" }),
        (value): value is { token: string; headerName: string } => record(value)
          && typeof value.token === "string" && value.headerName === "X-CSRF-TOKEN");
      return (await response(await fetcher("/api/profile/neighborhood", {
        method: "PUT", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify(neighborhood),
      }), (value): value is { neighborhood: Neighborhood } => isNeighborhoodView(value) && value.neighborhood !== null)).neighborhood;
    },
  };
}
