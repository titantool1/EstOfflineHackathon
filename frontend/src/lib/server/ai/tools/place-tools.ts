import "server-only";
import { createSpringClient } from "../../spring-client.ts";
import { isNeighborhoodView } from "../../../../features/profile/neighborhood-contract.ts";
import { readPlaces } from "../../../../features/map/contract.ts";
import { seoulDistricts } from "../../../../features/navigation/browse-district.ts";
import type { FunctionDefinition } from "../conversation-contracts.ts";

export class PlaceToolError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}

const definitions: FunctionDefinition[] = [{
  type: "function", name: "search_places", strict: true,
  description: "서울의 등록된 친환경 실천 장소 후보를 검색해 매장명·주소·출처를 읽는다. 제도 조회 없이 바로 사용한다. 우리 동네/지역 미지정은 saved_neighborhood로 로그인 사용자의 관심동네를 읽고, 명시한 서울/서울 구는 seoul을 쓴다. 현재 위치·실시간 영업·혜택을 보증하지 않는다. 다회용기와 다회용컵은 다른 검색이다.",
  parameters: { type: "object", additionalProperties: false, required: ["query", "location", "district"], properties: {
    query: { type: "string", minLength: 1, maxLength: 200, description: "지역·매장·혜택 같은 일반어는 빼고 요청 행동을 보존한 짧은 검색어. 예: 다회용기, 텀블러, 리필" },
    location: { type: "string", enum: ["saved_neighborhood", "seoul"], description: "서울/서울 구를 명시했으면 seoul, 우리 동네 또는 지역 미지정이면 saved_neighborhood. 다른 시·도는 지원하지 않으므로 서울로 바꾸지 않는다." },
    district: { type: "string", enum: ["", ...seoulDistricts], description: "seoul일 때 명시된 구, 구 미지정이면 빈 문자열. saved_neighborhood면 빈 문자열이며 서버가 저장된 구를 사용한다." },
  } },
}];

function validPlaces(value: unknown): value is ReturnType<typeof readPlaces> {
  try { readPlaces(value); return true; } catch { return false; }
}

export function createPlaceTools(client: ReturnType<typeof createSpringClient>) {
  return {
    definitions,
    async execute(name: string, input: unknown, context: {
      requestId?: string; signal?: AbortSignal; sessionHeaders?: HeadersInit;
    } = {}) {
      context.signal?.throwIfAborted();
      if (name !== "search_places") throw new PlaceToolError("TOOL_NOT_AVAILABLE");
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new PlaceToolError("INVALID_TOOL_ARGUMENTS");
      const args = input as Record<string, unknown>;
      if (Object.keys(args).length !== 3 || typeof args.query !== "string" || !args.query.trim() || args.query.length > 200
        || /[\u0000-\u001f\u007f]/.test(args.query)
        || typeof args.location !== "string" || !["saved_neighborhood", "seoul"].includes(args.location)
        || typeof args.district !== "string" || args.district !== "" && !seoulDistricts.includes(args.district)
        || args.location === "saved_neighborhood" && args.district !== "") throw new PlaceToolError("INVALID_TOOL_ARGUMENTS");
      let district = args.district;
      if (args.location === "saved_neighborhood") {
        // Identity and cookies are server-owned, never model arguments. Public searches receive no cookie.
        const cookie = new Headers(context.sessionHeaders).get("Cookie");
        if (!cookie) throw new PlaceToolError("AUTHENTICATION_REQUIRED", 401);
        const saved = await client.request("/api/profile/neighborhood", {
          validate: isNeighborhoodView, requestId: context.requestId, signal: context.signal, headers: { Cookie: cookie },
        });
        if (saved.body.error || !saved.body.data) throw new PlaceToolError(saved.body.error?.code ?? "BACKEND_INVALID_RESPONSE", saved.status >= 400 ? saved.status : 502);
        const neighborhood = saved.body.data.neighborhood;
        if (!neighborhood) return { status: "needs_location", message: "저장된 관심동네가 없다. 서울의 어느 구에서 찾을지 한 번 묻는다." };
        if (!["서울", "서울특별시"].includes(neighborhood.sido) || !seoulDistricts.includes(neighborhood.sigungu))
          return { status: "unsupported_region", message: "저장된 관심동네는 현재 서울 장소 검색 범위 밖이다. 서울로 임의 변경하지 않는다." };
        district = neighborhood.sigungu;
      }
      const response = await client.request("/api/places", {
        validate: validPlaces, requestId: context.requestId, signal: context.signal,
        query: { query: args.query.trim(), region: "서울특별시", district, latitude: 37.5665, longitude: 126.978, distanceKm: 30 },
      });
      if (response.body.error || !response.body.data) throw new PlaceToolError(response.body.error?.code ?? "BACKEND_INVALID_RESPONSE", response.status >= 400 ? response.status : 502);
      const result = readPlaces(response.body.data);
      return {
        status: result.results.length ? "ok" : "no_results", query: args.query.trim(),
        search_area: district ? `서울특별시 ${district} 구 단위` : "서울시청 중심 30km 범위(서울 전체 조회 아님)",
        scope: { sido: "서울특별시", sigungu: district || null, source: args.location,
          coverage: district ? "district" : "seoul_city_hall_30km", user_location_known: false },
        results: result.results.slice(0, 8).map(place => ({
          title: place.title, address: place.address, category: place.category, sourceUrl: place.sourceUrl,
        })),
        retrieved_count: result.results.length, displayed_count: Math.min(8, result.results.length),
        truncated: result.results.length > 8, upstream_limit: 40, total_count_known: false,
        operating_status: "unverified", benefit_status: "unverified",
        message: "답변 첫 문장에 검색한 지역과 범위를 자연스러운 한국어로 밝힌다. 내부 필드 이름은 출력하지 않는다. 등록된 실천 장소 후보만 확인했다. 영업·참여·할인·적립은 방문 전 출처에서 별도 확인이 필요하다. 사용자 현재 위치나 거리순이 아니다. 구가 없으면 서울시청 중심 30km 검색이며 전체 목록이 아니다. 0건은 이 검색조건의 등록자료 없음이며 매장 자체가 없다는 뜻이 아니다. 다회용기 결과를 다회용컵으로 대체하지 않는다.",
      };
    },
  };
}
