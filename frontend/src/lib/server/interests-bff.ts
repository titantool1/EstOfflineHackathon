import "server-only";
import { randomUUID } from "node:crypto";
import { isInterestSelectionInput } from "../../features/profile/interests-contract.ts";
import { BodyTooLarge, readRequestBody } from "./request-body.ts";
import { createInterestSpring, type InterestSpring } from "./profile-interests.ts";

const id = (request: Request) => /^[A-Za-z0-9_-]{1,64}$/.test(request.headers.get("X-Request-Id") ?? "")
  ? request.headers.get("X-Request-Id")! : randomUUID();
const headers = (requestId: string) => ({ "Cache-Control": "no-store", "X-Request-Id": requestId });
const failure = (status: number, code: string, message: string, requestId: string) =>
  Response.json({ data: null, error: { code, message }, requestId }, { status, headers: headers(requestId) });
const output = (result: Awaited<ReturnType<InterestSpring["get"]>>) =>
  Response.json(result.body, { status: result.status, headers: headers(result.body.requestId) });

function sameOrigin(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("Host") ?? requestUrl.host;
    const origin = request.headers.get("Origin");
    if (!origin || !host || /[\\/@,\s]/.test(host)) return false;
    const expected = new URL(`${requestUrl.protocol}//${host}`);
    const actual = new URL(origin);
    return ["http:", "https:"].includes(expected.protocol) && actual.username === "" && actual.password === ""
      && actual.pathname === "/" && actual.search === "" && actual.hash === "" && actual.origin === expected.origin;
  } catch { return false; }
}

export function createInterestHandlers(dependencies?: {
  spring?: InterestSpring;
  bodyTimeoutMs?: number;
  maxBodyBytes?: number;
}) {
  const spring = dependencies?.spring ?? createInterestSpring({
    baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080",
  });
  const bodyTimeoutMs = dependencies?.bodyTimeoutMs ?? 5_000;
  const maxBodyBytes = dependencies?.maxBodyBytes ?? 2_048;
  return {
    async get(request: Request) {
      return output(await spring.get(request.headers.get("X-Request-Id"), request.headers.get("Cookie")));
    },
    async put(request: Request) {
      const requestId = id(request);
      if (!sameOrigin(request)) return failure(403, "ORIGIN_INVALID", "요청 화면을 다시 확인해 주세요.", requestId);
      const signal = AbortSignal.any([AbortSignal.timeout(bodyTimeoutMs), request.signal]);
      let body: unknown;
      try {
        const text = await readRequestBody(request, signal, maxBodyBytes);
        body = JSON.parse(text) as unknown;
      } catch (error) {
        if (error instanceof BodyTooLarge)
          return failure(413, "REQUEST_BODY_TOO_LARGE", "요청 내용이 너무 큽니다.", requestId);
        if (signal.aborted)
          return failure(504, "REQUEST_TIMEOUT", "요청 시간이 초과되었습니다.", requestId);
        return failure(400, "INVALID_INTERESTS", "관심사를 다시 선택해 주세요.", requestId);
      }
      if (!isInterestSelectionInput(body))
        return failure(400, "INVALID_INTERESTS", "관심사를 다시 선택해 주세요.", requestId);
      return output(await spring.replace(body, requestId, request.headers.get("Cookie"),
        request.headers.get("X-CSRF-TOKEN")));
    },
  };
}
