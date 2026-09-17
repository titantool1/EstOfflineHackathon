import test from "node:test";
import assert from "node:assert/strict";
import { participationInfo } from "../src/features/missions/participation-info.ts";
import type { MissionCatalogDetail, MissionCondition } from "../src/features/missions/detail-contract.ts";

const source = { id: "source-id", url: "https://example.test/participate", title: "참여방법" };
const condition = (requirement: unknown, detail: unknown, mapping_basis = "explicit_ids"): MissionCondition => ({
  condition: { id: "internal-condition-id", requirement, detail, relation: "C01 AND C03", source_ids: [source.id] },
  sources: [source], common_groups: [{ group_key: "internal-group", definition: { internal: true } }], mapping_basis,
});
const catalog = (conditions: MissionCondition[]): MissionCatalogDetail => ({
  program_key: "scheme:example", action_id: "A01", title: "제도 전체", identity_basis: "internal_mapping",
  program_status: "unknown", eligibility_status: "not_evaluated", places: [],
  program: { benefit: "다른 미션의 보상", application_method: "A02 별도 신청", target: "다른 행동의 대상" },
  conditions, overview_sources: [source],
});

test("selected action instructions and common prerequisites stay separate, without program-wide or mapping fields", () => {
  const info = participationInfo(catalog([
    condition("탄소중립포인트 회원가입", "참여기업 실적 연계 필요", "program_common"),
    condition("텀블러·다회용컵 이용", "참여 커피전문점에서 일회용컵 대신 이용"),
  ]));
  assert.deepEqual(info.action, [{ title: "텀블러·다회용컵 이용", detail: "참여 커피전문점에서 일회용컵 대신 이용" }]);
  assert.deepEqual(info.common, [{ title: "탄소중립포인트 회원가입", detail: "참여기업 실적 연계 필요" }]);
  const visible = JSON.stringify(info);
  for (const hidden of ["다른 미션의 보상", "A02 별도 신청", "다른 행동의 대상", "internal-group", "C01 AND C03", "internal-condition-id", "mapping_basis"]) assert(!visible.includes(hidden));
  assert.equal(info.sources.length, 1);
});

test("reader notes remove catalog bookkeeping while retaining practical requirements and uncertainty", () => {
  const info = participationInfo(catalog([
    condition("참여기업 확인", "참여 항목/기업별 매뉴얼을 따른다. 전체기업 공통 설정 완료 boolean이 아님."),
    condition("20개 또는 1kg 이상", "입력에 기록된 개별 요건"),
    condition("사진 인증", "현금·경품 지급은 확인되지 않음"),
    condition("주 120개·종량제봉투 6장까지", "예산 소진 시까지 2026 연중"),
  ]));
  assert.equal(info.action[0].detail, "이용할 참여기업의 해당 실천 항목 안내를 확인해 주세요.");
  assert.deepEqual(info.action[1], { title: "20개 또는 1kg 이상", detail: null });
  assert.equal(info.action[2].detail, "현금·경품 지급은 확인되지 않음");
  assert.equal(info.action[3].detail, "예산 소진 시까지 2026 연중");
});

test("empty and structured fields are not flattened into internal keys; source URLs are safe and deduplicated", () => {
  const detail = catalog([condition({ mapping_basis: "secret" }, { unknown: true }), condition(" ", " ")]);
  detail.overview_sources.push({ id: "bad", title: "unsafe", url: "javascript:alert(1)" });
  assert.deepEqual(participationInfo(detail), { action: [], common: [], sources: [source] });
  detail.conditions = []; detail.overview_sources = [];
  assert.deepEqual(participationInfo(detail), { action: [], common: [], sources: [] });
});
