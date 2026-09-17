import { isUuid, type MissionEventInput } from "./contract.ts";
import { isMissionItemDetail, type MissionItemDetail } from "./detail-contract.ts";

type Envelope = {
  data: unknown;
  error: { code: string; message: string } | null;
  requestId: string;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export class MissionDetailClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "MissionDetailClientError";
    this.status = status;
    this.code = code;
  }
}

function invalidResponse() {
  return new MissionDetailClientError(503, "INVALID_RESPONSE", "상세 응답을 확인하지 못했어요.");
}

export function createMissionDetailClient(fetcher: typeof fetch = fetch) {
  return async (batchId: string, itemId: string, signal?: AbortSignal): Promise<MissionItemDetail> => {
    if (!isUuid(batchId) || !isUuid(itemId))
      throw new MissionDetailClientError(400, "INVALID_MISSION_REQUEST", "추천 묶음과 항목 번호를 확인해 주세요.");
    let reply: Response;
    try {
      reply = await fetcher(`/api/missions/recommendations/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}/detail`, {
        cache: "no-store", credentials: "same-origin", redirect: "error", signal,
      });
    } catch {
      if (signal?.aborted) throw new MissionDetailClientError(499, "REQUEST_CANCELLED", "요청을 취소했어요.");
      throw new MissionDetailClientError(503, "NETWORK_ERROR", "서버에 연결하지 못했어요.");
    }
    let value: unknown;
    try { value = await reply.json(); } catch { throw invalidResponse(); }
    if (!object(value) || typeof value.requestId !== "string" || !("data" in value) || !("error" in value))
      throw invalidResponse();
    const envelope = value as Envelope;
    if (!reply.ok) {
      if (!object(envelope.error) || typeof envelope.error.code !== "string"
          || typeof envelope.error.message !== "string") throw invalidResponse();
      throw new MissionDetailClientError(reply.status, envelope.error.code, envelope.error.message);
    }
    if (envelope.error !== null || !isMissionItemDetail(envelope.data)) throw invalidResponse();
    return envelope.data;
  };
}

export function createViewEvent(batchId: string, itemId: string,
  eventType: "detail_view" | "map_open", createId: () => string = () => crypto.randomUUID(),
  now = () => new Date()) {
  const occurredAt = now().toISOString();
  return { clientEventId: createId(), batchId, itemId, eventType, occurredAt } satisfies MissionEventInput;
}

export function detailErrorMessage(error: unknown) {
  if (!(error instanceof MissionDetailClientError)) return "상세 정보를 불러오지 못했어요.";
  if (error.status === 401) return "로그인한 뒤 다시 확인해 주세요.";
  if (error.status === 404) return "이 추천 묶음에서 항목을 찾지 못했어요.";
  return error.message || "상세 정보를 불러오지 못했어요.";
}
