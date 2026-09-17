import { isInterestProfile, type InterestProfile, type InterestSelectionInput } from "./interests-contract.ts";

type Envelope<T> = { data: T | null; error: { code: string; message: string } | null; requestId: string };
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export class InterestClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.name = "InterestClientError"; this.status = status; this.code = code;
  }
}

const invalid = () => new InterestClientError(503, "INVALID_RESPONSE", "응답을 확인하지 못했어요.");

async function read<T>(reply: Response, validate: (value: unknown) => value is T): Promise<T> {
  let value: unknown;
  try { value = await reply.json(); } catch { throw invalid(); }
  if (!record(value) || typeof value.requestId !== "string") throw invalid();
  const envelope = value as Envelope<unknown>;
  if (!reply.ok) {
    if (!record(envelope.error) || typeof envelope.error.code !== "string"
        || typeof envelope.error.message !== "string") throw invalid();
    throw new InterestClientError(reply.status, envelope.error.code, envelope.error.message);
  }
  if (envelope.error !== null || !validate(envelope.data)) throw invalid();
  return envelope.data;
}

function converted(error: unknown, signal?: AbortSignal): InterestClientError {
  if (error instanceof InterestClientError) return error;
  if (signal?.aborted) return new InterestClientError(499, "REQUEST_CANCELLED", "요청을 취소했어요.");
  return new InterestClientError(503, "NETWORK_ERROR", "서버에 연결하지 못했어요.");
}

export function createInterestClient(fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, validate: (value: unknown) => value is T,
      init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    try {
      return await read(await fetcher(path, { ...init, signal, cache: "no-store",
        credentials: "same-origin", redirect: "error" }), validate);
    } catch (error) { throw converted(error, signal); }
  }
  return {
    get(signal?: AbortSignal): Promise<InterestProfile> {
      return request("/api/profile/interests", isInterestProfile, {}, signal);
    },
    async save(input: InterestSelectionInput, signal?: AbortSignal): Promise<InterestProfile> {
      const csrf = await request("/api/auth/csrf",
        (value): value is { token: string; headerName: "X-CSRF-TOKEN" } => record(value)
          && typeof value.token === "string" && value.token.length > 0
          && value.headerName === "X-CSRF-TOKEN", {}, signal);
      return request("/api/profile/interests", isInterestProfile, {
        method: "PUT",
        headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token },
        body: JSON.stringify(input),
      }, signal);
    },
  };
}
