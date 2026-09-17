import test from "node:test";
import assert from "node:assert/strict";
import { createSpringClient } from "../src/lib/server/spring-client.ts";
import { createCatalogTools, CatalogToolError } from "../src/lib/server/ai/tools/catalog-tools.ts";

const page = { query: "컵", match_mode: "all_keywords_literal", offset: 0, limit: 10, has_more: false, items: [] };
const detail = { program_key: "P", action_id: "A", title: "제도", identity_basis: "explicit", program_status: "미확인",
  program: { caveat: "확인 필요", benefit: "안내" }, overview_sources: [{ id: "S", title: "공식 안내", url: "https://example.org" }],
  conditions: [{ condition: { id: "C", verification: "미확인", value: false }, sources: [], common_groups: [], mapping_basis: "explicit" }],
  places: [{ place_id: "PL", title: "장소", address: "주소", service_key: "cup", source: { id: "S", title: "원문", url: "https://example.org" }, status: "closed", schedule: {}, announced_start: null, announced_end_exclusive: null }],
  eligibility_status: "not_evaluated" };
function tools(data: unknown, status = 200, code = "DATABASE_UNAVAILABLE", observe?: (url: URL) => void) {
  return createCatalogTools(createSpringClient({ baseUrl: "http://backend.test", fetch: async (input, init) => {
    observe?.(new URL(String(input)));
    const id = new Headers(init?.headers).get("X-Request-Id");
    return Response.json({ data: status === 200 ? data : null, error: status === 200 ? null : { code, message: "오류" }, requestId: id },
      { status, headers: { "X-Request-Id": id! } });
  } }));
}
const search = { query: "컵", limit: 10, offset: 0 };
test("empty data is no_results with registration wording", async () => {
  const result = await tools(page).execute("search_catalog", search, { requestId: "test-search" });
  assert.equal(result.status, "no_results"); assert.match(result.message!, /등록자료/);
  assert.equal(result.requestId, "test-search");
});
test("details retain source, uncertainty, false and closed places", async () => {
  const result = await tools(detail).execute("get_catalog_action", { programKey: "P", actionId: "A" });
  assert.deepEqual(result.data, detail);
});
test("only exact missing-action error is not_found", async () => {
  const args = { programKey: "P", actionId: "A" };
  assert.equal((await tools(null, 404, "CATALOG_ACTION_NOT_FOUND").execute("get_catalog_action", args)).status, "not_found");
  await assert.rejects(tools(null, 404, "HTTP_404").execute("get_catalog_action", args), { code: "HTTP_404" });
});
test("DB and connection errors never become empty search", async () => {
  await assert.rejects(tools(null, 503).execute("search_catalog", search), { code: "DATABASE_UNAVAILABLE", status: 503 });
  const down = createCatalogTools(createSpringClient({ baseUrl: "http://backend.test", fetch: async () => { throw new Error("down"); } }));
  await assert.rejects(down.execute("search_catalog", search), { code: "BACKEND_UNAVAILABLE" });
});
test("mismatched IDs or incomplete provenance are rejected", async () => {
  const args = { programKey: "P", actionId: "A" };
  for (const bad of [{ ...detail, action_id: "B" }, { ...detail, overview_sources: [{}] }, { ...detail, eligibility_status: "eligible" }])
    await assert.rejects(tools(bad).execute("get_catalog_action", args), { code: "BACKEND_INVALID_RESPONSE" });
});
test("page metadata must match the request", async () => {
  for (const bad of [{ ...page, offset: 10 }, { ...page, query: "다른검색" }])
    await assert.rejects(tools(bad).execute("search_catalog", search), { code: "BACKEND_INVALID_RESPONSE" });
});
test("invalid or extra model arguments do not reach HTTP", async () => {
  let calls = 0; const api = tools(page, 200, "", () => { calls++; });
  for (const args of [{ ...search, limit: 21 }, { ...search, query: " " }, { ...search, offset: -1 },
    { ...search, query: "a b c d e f g h i" }, { ...search, userId: "other" }])
    await assert.rejects(api.execute("search_catalog", args), { code: "INVALID_TOOL_ARGUMENTS" });
  await assert.rejects(api.execute("get_catalog_action", { programKey: " P", actionId: "A" }), { code: "INVALID_TOOL_ARGUMENTS" });
  await assert.rejects(api.execute("arbitrary_tool", {}), { code: "TOOL_NOT_AVAILABLE" });
  assert.equal(calls, 0);
});
test("literal terms are encoded without changing request target", async () => {
  const q = "컵 %_'";
  const result = await tools({ ...page, query: q }, 200, "", url => {
    assert.equal(url.pathname, "/api/catalog/actions"); assert.equal(url.searchParams.get("query"), q);
  }).execute("search_catalog", { ...search, query: q });
  assert.equal(result.status, "no_results");
});
test("cancellation propagates without an empty success", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(tools(page).execute("search_catalog", search, { signal: controller.signal }), { code: "REQUEST_CANCELLED" });
});
test("later empty pages do not claim entire catalogue absence", async () => {
  const result = await tools({ ...page, offset: 20 }).execute("search_catalog", { ...search, offset: 20 });
  assert.match(result.message!, /이 페이지/);
  assert.ok(CatalogToolError.prototype instanceof Error);
});
