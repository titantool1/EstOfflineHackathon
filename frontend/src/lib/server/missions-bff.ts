import "server-only";
import { randomUUID } from "node:crypto";
import { isMissionEventInput, isMissionRecommendationInput, isUuid } from "../../features/missions/contract.ts";
import { BodyTooLarge, readRequestBody } from "./request-body.ts";
import { createMissionsSpring, type MissionsSpring } from "./missions-spring.ts";

const id = (request: Request) => /^[A-Za-z0-9_-]{1,64}$/.test(request.headers.get("X-Request-Id") ?? "")
  ? request.headers.get("X-Request-Id")! : randomUUID();
const headers = (requestId: string) => ({ "Cache-Control": "no-store", "X-Request-Id": requestId });
const failure = (status: number, code: string, message: string, requestId: string) =>
  Response.json({ data: null, error: { code, message }, requestId }, { status, headers: headers(requestId) });
const output = (result: { status: number; body: { data: unknown; error: unknown; requestId: string } }) =>
  Response.json(result.body, { status: result.status, headers: headers(result.body.requestId) });
function sameOrigin(request: Request) {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("Host") ?? url.host;
    const origin = request.headers.get("Origin");
    if (!origin || !host || /[\\/@,\s]/.test(host)) return false;
    const expected = new URL(`${url.protocol}//${host}`);
    const actual = new URL(origin);
    return ["http:", "https:"].includes(expected.protocol) && !actual.username && !actual.password
      && actual.pathname === "/" && !actual.search && !actual.hash && actual.origin === expected.origin;
  } catch { return false; }
}

export function createMissionHandlers(dependencies?: {
  spring?: MissionsSpring;
  bodyTimeoutMs?: number;
  maxBodyBytes?: number;
}) {
  const spring = dependencies?.spring ?? createMissionsSpring({
    baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080",
  });
  const timeoutMs = dependencies?.bodyTimeoutMs ?? 5_000;
  const maxBytes = dependencies?.maxBodyBytes ?? 2_048;
  async function body(request: Request, validator: (value: unknown) => boolean): Promise<
    { response: Response } | { value: unknown; requestId: string }
  > {
    const requestId = id(request);
    if (!sameOrigin(request))
      return { response: failure(403, "ORIGIN_INVALID", "요청 화면을 다시 확인해 주세요.", requestId) };
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), request.signal]);
    try {
      const value: unknown = JSON.parse(await readRequestBody(request, signal, maxBytes));
      if (!validator(value))
        return { response: failure(400, "INVALID_MISSION_REQUEST", "요청 내용을 확인해 주세요.", requestId) };
      return { value, requestId };
    } catch (error) {
      if (error instanceof BodyTooLarge)
        return { response: failure(413, "REQUEST_BODY_TOO_LARGE", "요청 내용이 너무 큽니다.", requestId) };
      if (signal.aborted)
        return { response: failure(504, "REQUEST_TIMEOUT", "요청 시간이 초과되었습니다.", requestId) };
      return { response: failure(400, "INVALID_MISSION_REQUEST", "요청 내용을 확인해 주세요.", requestId) };
    }
  }
  return {
    async getProgress(request: Request) {
      return output(await spring.getProgress(id(request), request.headers.get("Cookie")));
    },
    async createRecommendation(request: Request) {
      const parsed = await body(request, isMissionRecommendationInput);
      if ("response" in parsed) return parsed.response;
      return output(await spring.createRecommendation(parsed.value, parsed.requestId,
        request.headers.get("Cookie"), request.headers.get("X-CSRF-TOKEN")));
    },
    async getRecommendation(request: Request, batchId: string) {
      const requestId = id(request);
      if (!isUuid(batchId))
        return failure(400, "INVALID_MISSION_REQUEST", "추천 묶음 번호를 확인해 주세요.", requestId);
      return output(await spring.getRecommendation(batchId, requestId, request.headers.get("Cookie")));
    },
    async recordEvent(request: Request) {
      const parsed = await body(request, isMissionEventInput);
      if ("response" in parsed) return parsed.response;
      return output(await spring.recordEvent(parsed.value, parsed.requestId,
        request.headers.get("Cookie"), request.headers.get("X-CSRF-TOKEN")));
    },
  };
}
