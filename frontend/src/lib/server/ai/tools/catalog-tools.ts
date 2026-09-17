import "server-only";
import { createSpringClient } from "../../spring-client.ts";
import { createCatalogClient, object } from "../../catalog-client.ts";
import type { SpringResult } from "../../spring-client.ts";

export const catalogToolDefinitions = [
  {
    type: "function", name: "search_catalog", strict: true,
    description: "등록된 공개 제도·행동 후보를 찾는다. 사용자의 친환경 행동·혜택 목적을 보존한 짧고 구체적인 검색 문구를 사용한다. Nori 키워드와 의미 벡터 결과를 함께 순위화한다. 결과의 program_key와 action_id로 상세를 조회한다. 후보는 개인 적격성·현재 운영 확인을 뜻하지 않는다.",
    parameters: { type: "object", additionalProperties: false, properties: {
      query: { type: "string", minLength: 1, maxLength: 200 },
      limit: { type: "integer", minimum: 1, maximum: 20 },
      offset: { type: "integer", minimum: 0, maximum: 1000 },
    }, required: ["query", "limit", "offset"] },
  },
  {
    type: "function", name: "get_catalog_action", strict: true,
    description: "검색 결과에서 선택한 programKey/actionId의 행동 상세를 조회한다. 프로그램 개요와 행동별 조건·근거·연결 장소를 구분해서 사용한다. 조건의 AND/OR·미확인·정정·장소 운영 상태를 보존한다. eligibility_status=not_evaluated이며 사용자의 자격 판정 도구가 아니다. ID를 추측하지 않는다.",
    parameters: { type: "object", additionalProperties: false, properties: {
      programKey: { type: "string", minLength: 1, maxLength: 160 },
      actionId: { type: "string", minLength: 1, maxLength: 160 },
    }, required: ["programKey", "actionId"] },
  },
] as const;

export class CatalogToolError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;
  constructor(code: string, status = 400, requestId?: string) {
    super(code); this.name = "CatalogToolError"; this.code = code; this.status = status; this.requestId = requestId;
  }
}
function exact(input: unknown, keys: string[]): asserts input is Record<string, unknown> {
  if (!object(input) || Object.keys(input).length !== keys.length || keys.some(k => !(k in input)))
    throw new CatalogToolError("INVALID_TOOL_ARGUMENTS");
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 160
      || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new CatalogToolError("INVALID_TOOL_ARGUMENTS");
  return value;
}
function unwrap<T>(result: SpringResult<T>): T {
  if (result.body.error || result.body.data === null)
    throw new CatalogToolError(result.body.error?.code ?? "BACKEND_INVALID_RESPONSE", result.status, result.body.requestId);
  return result.body.data;
}
type CallContext = { requestId?: string; signal?: AbortSignal };
export function createCatalogTools(client = createSpringClient({
  baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080",
}), embed?: (query: string, signal: AbortSignal) => Promise<number[]>) {
  const catalog = createCatalogClient(client);
  return {
    definitions: catalogToolDefinitions,
    async execute(name: string, input: unknown, context: CallContext = {}) {
      if (name === "search_catalog") {
        exact(input, ["query", "limit", "offset"]);
        const { query, limit, offset } = input;
        if (typeof query !== "string" || !query.trim() || query.length > 200
            || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 20
            || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 1000)
          throw new CatalogToolError("INVALID_TOOL_ARGUMENTS");
        if (!embed) throw new CatalogToolError("EMBEDDING_NOT_CONFIGURED", 503);
        const signal = context.signal ?? AbortSignal.timeout(60_000);
        const embedding = await embed(query.trim(), signal);
        const result = await catalog.search(query.trim(), embedding, limit, offset, context.requestId, signal);
        const data = unwrap(result);
        return { status: data.items.length ? "ok" : "no_results", data, requestId: result.body.requestId,
          message: data.items.length ? null : offset === 0 ? "검색 조건에 맞는 등록자료가 없어요." : "이 페이지에 추가 등록자료가 없어요." };
      }
      if (name === "get_catalog_action") {
        exact(input, ["programKey", "actionId"]);
        const result = await catalog.detail(identifier(input.programKey), identifier(input.actionId), context.requestId, context.signal);
        if (result.status === 404 && result.body.error?.code === "CATALOG_ACTION_NOT_FOUND")
          return { status: "not_found", data: null, requestId: result.body.requestId, message: "등록된 제도·행동 자료가 없어요." };
        return { status: "ok", data: unwrap(result), requestId: result.body.requestId, message: null };
      }
      throw new CatalogToolError("TOOL_NOT_AVAILABLE");
    },
  };
}
