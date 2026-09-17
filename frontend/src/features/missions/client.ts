import {
  isMissionEvent,
  isMissionRecommendationBatch,
  type MissionEvent,
  type MissionEventInput,
  type MissionRecommendationBatch,
  type MissionRecommendationInput,
} from "./contract.ts";

type Envelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export class MissionClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MissionClientError";
    this.status = status;
    this.code = code;
  }
}

function invalidResponse(): MissionClientError {
  return new MissionClientError(503, "INVALID_RESPONSE", "응답을 확인하지 못했어요.");
}

async function read<T>(reply: Response, validate: (value: unknown) => value is T): Promise<T> {
  let value: unknown;
  try {
    value = await reply.json();
  } catch {
    throw invalidResponse();
  }
  if (!record(value) || typeof value.requestId !== "string") throw invalidResponse();
  const envelope = value as Envelope<unknown>;
  if (!reply.ok) {
    if (!record(envelope.error) || typeof envelope.error.code !== "string"
        || typeof envelope.error.message !== "string") throw invalidResponse();
    throw new MissionClientError(reply.status, envelope.error.code, envelope.error.message);
  }
  if (envelope.error !== null || !validate(envelope.data)) throw invalidResponse();
  return envelope.data;
}

function asClientError(error: unknown, signal?: AbortSignal): MissionClientError {
  if (error instanceof MissionClientError) return error;
  if (signal?.aborted) return new MissionClientError(499, "REQUEST_CANCELLED", "요청을 취소했어요.");
  return new MissionClientError(503, "NETWORK_ERROR", "서버에 연결하지 못했어요.");
}

export function createMissionClient(fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, validate: (value: unknown) => value is T,
      init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    try {
      return await read(await fetcher(path, {
        ...init,
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        signal,
      }), validate);
    } catch (error) {
      throw asClientError(error, signal);
    }
  }

  async function csrf(signal?: AbortSignal): Promise<{ token: string; headerName: "X-CSRF-TOKEN" }> {
    return request("/api/auth/csrf", (value): value is { token: string; headerName: "X-CSRF-TOKEN" } =>
      record(value) && typeof value.token === "string" && value.token.length > 0
        && value.headerName === "X-CSRF-TOKEN", {}, signal);
  }

  async function mutate<T>(path: string, input: unknown, validate: (value: unknown) => value is T,
      signal?: AbortSignal): Promise<T> {
    const token = await csrf(signal);
    return request(path, validate, {
      method: "POST",
      headers: { "Content-Type": "application/json", [token.headerName]: token.token },
      body: JSON.stringify(input),
    }, signal);
  }

  return {
    recommend(input: MissionRecommendationInput, signal?: AbortSignal): Promise<MissionRecommendationBatch> {
      return mutate("/api/missions/recommendations", input, isMissionRecommendationBatch, signal);
    },
    getBatch(batchId: string, signal?: AbortSignal): Promise<MissionRecommendationBatch> {
      return request(`/api/missions/recommendations/${encodeURIComponent(batchId)}`,
        isMissionRecommendationBatch, {}, signal);
    },
    recordEvent(input: MissionEventInput, signal?: AbortSignal): Promise<MissionEvent> {
      return mutate("/api/missions/events", input, isMissionEvent, signal);
    },
  };
}
