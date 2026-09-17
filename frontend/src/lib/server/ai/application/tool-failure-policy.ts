// Changing query words or tool arguments cannot repair these service/protocol failures.
const serviceCodes = new Set([
  "EMBEDDING_NOT_CONFIGURED", "EMBEDDING_UNAVAILABLE", "INVALID_EMBEDDING_RESPONSE",
  "INVALID_BACKEND_REQUEST", "BACKEND_CLIENT_CONFIG_ERROR", "BACKEND_INVALID_RESPONSE", "BACKEND_TIMEOUT", "BACKEND_UNAVAILABLE",
  "CATALOG_SEARCH_UPSTREAM_FAILED", "CATALOG_SEARCH_RESPONSE_INVALID", "CATALOG_SEARCH_PARTIAL",
  "DATABASE_UNAVAILABLE",
]);

export function endsToolUseForTurn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; status?: unknown };
  return typeof value.code === "string" && serviceCodes.has(value.code)
    || typeof value.status === "number" && Number.isInteger(value.status)
      && (value.status >= 500 && value.status <= 599 || [401, 403, 429].includes(value.status));
}

export const toolFailureCompletion = `이번 턴의 도구 조회는 서버 연결·서비스·접근 오류로 중단되었다. 검색어를 바꾸거나 다른 도구로 재시도하지 말고, 요청한 조회를 완료하지 못했다는 짧은 안내로 답변을 마친다. 검색 결과가 0건이거나 제도가 없다고 말하지 않는다. 이전 상담 정보가 있어도 이번에 재확인한 사실로 안내하지 않는다. 내부 오류 코드나 기술 세부사항은 노출하지 않는다.`;
