import "server-only";
import { randomUUID } from "node:crypto";
import { isNeighborhood } from "../../features/profile/neighborhood-contract.ts";
import { createKakaoLocal, KakaoLocalError } from "./kakao-local.ts";
import { createNeighborhoodSpring, type NeighborhoodSpring } from "./profile-neighborhood.ts";

type Kakao = ReturnType<typeof createKakaoLocal>;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (request: Request) => /^[A-Za-z0-9_-]{1,64}$/.test(request.headers.get("X-Request-Id") ?? "")
  ? request.headers.get("X-Request-Id")! : randomUUID();
const headers = (requestId: string) => ({ "Cache-Control": "no-store", "X-Request-Id": requestId });
const failure = (status: number, code: string, message: string, requestId: string) =>
  Response.json({ data: null, error: { code, message }, requestId }, { status, headers: headers(requestId) });
const output = (result: Awaited<ReturnType<NeighborhoodSpring["get"]>>) =>
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

async function json(request: Request) {
  try { return await request.json() as unknown; } catch { return undefined; }
}

export function createNeighborhoodHandlers(dependencies?: { spring?: NeighborhoodSpring; kakao?: Kakao }) {
  const spring = dependencies?.spring ?? createNeighborhoodSpring({
    baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080",
  });
  const kakao = dependencies?.kakao ?? createKakaoLocal({ apiKey: process.env.KAKAO_REST_API_KEY });
  return {
    async get(request: Request) {
      return output(await spring.get(request.headers.get("X-Request-Id"), request.headers.get("Cookie")));
    },
    async put(request: Request) {
      const requestId = id(request);
      if (!sameOrigin(request)) return failure(403, "ORIGIN_INVALID", "요청 화면을 다시 확인해 주세요.", requestId);
      const body = await json(request);
      if (!isNeighborhood(body)) return failure(400, "INVALID_NEIGHBORHOOD", "저장할 동네를 다시 선택해 주세요.", requestId);
      return output(await spring.save(body, requestId, request.headers.get("Cookie"), request.headers.get("X-CSRF-TOKEN")));
    },
    async resolve(request: Request) {
      const requestId = id(request);
      if (!sameOrigin(request)) return failure(403, "ORIGIN_INVALID", "요청 화면을 다시 확인해 주세요.", requestId);
      const authentication = await spring.get(requestId, request.headers.get("Cookie"));
      if (authentication.status !== 200) return output(authentication);
      const body = await json(request);
      if (!record(body)) return failure(400, "INVALID_LOCATION_INPUT", "검색어나 현재 위치를 확인해 주세요.", requestId);
      const keys = Object.keys(body);
      const queryMode = keys.length === 1 && keys[0] === "query" && typeof body.query === "string";
      const coordinateMode = keys.length === 2 && keys.includes("latitude") && keys.includes("longitude")
        && typeof body.latitude === "number" && Number.isFinite(body.latitude) && body.latitude >= -90 && body.latitude <= 90
        && typeof body.longitude === "number" && Number.isFinite(body.longitude) && body.longitude >= -180 && body.longitude <= 180;
      if (!queryMode && !coordinateMode)
        return failure(400, "INVALID_LOCATION_INPUT", "검색어나 현재 위치를 확인해 주세요.", requestId);
      const query = queryMode ? (body.query as string).trim() : "";
      if (queryMode && (!query || query.length > 100))
        return failure(400, "INVALID_LOCATION_INPUT", "검색어를 100자 이하로 입력해 주세요.", requestId);
      try {
        const result = queryMode
          ? await kakao.search(query)
          : await kakao.coordinates(body.latitude as number, body.longitude as number);
        return Response.json({ data: result, error: null, requestId }, { headers: headers(requestId) });
      } catch (error) {
        if (error instanceof KakaoLocalError) return failure(error.status, error.code, error.message, requestId);
        return failure(503, "KAKAO_UNAVAILABLE", "동네 검색 서비스에 연결할 수 없어요.", requestId);
      }
    },
  };
}
