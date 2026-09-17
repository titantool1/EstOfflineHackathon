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

function grouped(requirement: string, group: string, logic: string, detail = "") {
  const entry = condition(requirement, detail);
  entry.condition.group = group;
  entry.condition.group_logic = logic;
  return entry;
}

test("appliance support keeps alternative welfare types separate from mandatory purchase and limits", () => {
  const input = catalog([
    grouped("다자녀 가구", "복지할인 자격", "묶음 안 하나 충족(기존 자료)", "기존 자료상 15% 유형이나 2026 본문 미열람"),
    grouped("대상 제품 구매", "구매·제품", "모두 충족"),
    grouped("중증장애인", "복지할인 자격", "묶음 안 하나 충족(기존 자료)", "기존 자료상 30% 유형; 2026 본문 미열람"),
    grouped("잔여 한도", "가구 누적한도", "제한"),
  ]);
  input.program_key = "scheme:G022";
  const original = structuredClone(input);
  const { action } = participationInfo(input);
  assert.equal(action[0].group, "복지할인 자격 · 이 중 하나");
  assert.equal(action[2].group, action[0].group);
  assert.equal(action[1].group, "필수 조건 · 모두 충족");
  assert.equal(action[3].group, "지원 한도");
  assert.equal(action[0].detail, "현재 유형별 지원 비율은 공식 안내에서 확인해 주세요.");
  assert.deepEqual(input, original, "stored evidence must not be rewritten");
});

test("voucher income, alternative household types and exclusions retain separate meanings", () => {
  const input = catalog([
    grouped("수급 자격", "소득·수급 자격", "모두 충족"),
    grouped("노인", "세대원 특성", "묶음 안 하나 충족"),
    grouped("영유아", "세대원 특성", "묶음 안 하나 충족"),
    grouped("전원 시설 수급", "제외·중복", "제외", "전원 해당 시 제외"),
  ]);
  input.program_key = "scheme:G031";
  const { action } = participationInfo(input);
  assert.deepEqual(action.map(x => x.group), ["필수 조건 · 모두 충족", "세대원 특성 · 이 중 하나", "세대원 특성 · 이 중 하나", "제외·중복 제한"]);
  assert.equal(action[3].detail, "전원 해당 시 제외");
});

test("remodeling preferential categories do not become mandatory participation requirements", () => {
  const input = catalog([
    grouped("사업·금융 심사", "심사·금융", "모두 충족"),
    grouped("건물 유형별 성능", "성능개선 기준", "건물유형별 하나 충족"),
    grouped("신혼부부", "우대 이자지원", "묶음 안 하나 충족", "혼인 7년 이내; 5.5%p"),
    grouped("다자녀", "우대 이자지원", "묶음 안 하나 충족"),
  ]);
  input.program_key = "scheme:G027";
  const { action } = participationInfo(input);
  assert.equal(action[1].group, "성능개선 · 해당 건물 유형의 기준 충족");
  assert.equal(action[2].group, "추가 우대 · 기본 조건을 갖추고 이 중 하나");
  assert.equal(action[3].group, action[2].group);
  assert.equal(action[2].detail, "혼인 7년 이내; 5.5%p");
});

test("unreviewed and conditional branches are not guessed; same text in different roles is retained", () => {
  const input = catalog([grouped("동일 내용", "세대원 특성", "묶음 안 하나 충족"), grouped("동일 내용", "제외·중복", "제외")]);
  input.program_key = "scheme:G031";
  assert.equal(participationInfo(input).action.length, 2);
  input.program_key = "scheme:unreviewed";
  assert.equal(participationInfo(input).action[0].group, undefined);
  input.program_key = "scheme:G031";
  input.conditions = [grouped("조건부 안내", "조건", "조건부 모두 충족")];
  assert.equal(participationInfo(input).action[0].group, undefined);
});

test("editorial replacements retain uncertainty and closure rather than claiming current eligibility", () => {
  const { action } = participationInfo(catalog([
    condition("이전 조건", "기존 자료"),
    condition("입력 기준 모집 종료 또는 접수 마감", "현재 신규모집으로 안내하지 않음"),
    condition("20개당 10L 종량제봉투 1장", "주 120개·6장까지"),
    condition("기존 민간건축물", "앱에서 수량입력"),
  ]));
  assert.match(action[0].detail!, /이전 안내.*현재 적용 여부/);
  assert.equal(action[1].title, "확인된 회차는 모집이 마감됐어요.");
  assert.match(action[1].detail!, /다음 모집 여부/);
  assert.equal(action[2].title, "20개당 10L 종량제봉투 1장");
  assert.equal(action[2].detail, "주 120개·6장까지");
  assert.equal(action[3].title, "기존 민간건축물");
  assert.equal(action[3].detail, "앱에서 수량입력");
});
