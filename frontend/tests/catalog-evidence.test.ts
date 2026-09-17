import test from "node:test";
import assert from "node:assert/strict";
import { compactCatalogEvidence } from "../src/lib/server/ai/tools/catalog-evidence.ts";

const source = { id: "S1", title: "공식 참여 방법", url: "https://example.org/conditions",
  checked_at: "2026-09-17", supports: "행동별 단가·지역·참여 채널을 확인한 자료이며 실시간 운영 확인과 구분한다.", status: "확인" };
const revised = { ...source, supports: "다른 시점의 근거", status: "미확인" };
const data = {
  program_key: "P", action_id: "A", title: "다회용기", identity_basis: "explicit", program_status: null,
  eligibility_status: "not_evaluated", program: { benefit: "500원/회", caveat: "일부 지역만 해당", extra: false },
  overview_sources: [source, revised],
  conditions: Array.from({ length: 4 }, (_, index) => ({
    condition: { id: `C${index}`, requirement: "참여 배달서비스에서 다회용기 선택", relation: "C1 AND (C2 OR C3)",
      value: false, unknown: null, refused: true, verification: "미확인" },
    sources: [source, revised, source], common_groups: [{ extra: "mapping retained" }], mapping_basis: "explicit",
  })),
  places: [{ place_id: "PL", title: "장소", address: "주소", service_key: "cup", source,
    status: "closed", schedule: {}, announced_start: null, announced_end_exclusive: null }],
  future_field: { retained: true },
};

test("deduplication preserves all evidence, distinct revisions, condition logic and closed places", () => {
  const original = { status: "ok", data, requestId: "request", message: null };
  const before = structuredClone(original);
  // JSON round trip also represents the actual tool-to-model transport.
  const compact = JSON.parse(JSON.stringify(compactCatalogEvidence(original)));
  assert.equal(compact.data.source_table.length, 2);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(original).length);
  const { source_table: table, source_ref_format: format, overview_source_refs: refs, conditions, ...rest } = compact.data;
  assert.match(format, /zero-based/);
  const restored = { ...compact, data: { ...rest, overview_sources: refs.map((i: number) => table[i]),
    conditions: conditions.map((item: { source_refs: number[] }) => {
      const { source_refs, ...condition } = item;
      return { ...condition, sources: source_refs.map(i => table[i]) };
    }),
  } };
  assert.deepEqual(restored, original);
  assert.deepEqual(original, before);
});

test("future fields colliding with reference format keep the original payload", () => {
  for (const field of ["source_table", "source_ref_format", "overview_source_refs"]) {
    const result = { status: "ok", data: { ...data, [field]: "future" } };
    assert.equal(compactCatalogEvidence(result), result);
  }
  const result = { status: "ok", data: { ...data, conditions: [{ ...data.conditions[0], source_refs: [] }] } };
  assert.equal(compactCatalogEvidence(result), result);
});

test("errors, missing details and empty source lists are not expanded or rewritten", () => {
  for (const result of [null, { status: "not_found", data: null }, { status: "error", error: { code: "UPSTREAM" } },
    { status: "ok", data: { ...data, overview_sources: [], conditions: [], places: [] } }]) {
    assert.equal(compactCatalogEvidence(result), result);
  }
});
