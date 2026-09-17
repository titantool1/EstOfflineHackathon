import type { MissionCatalogDetail, MissionSource } from "./detail-contract.ts";
import { safeSourceUrl } from "../sources/source-reference.ts";

export type ParticipationCondition = { title: string; detail: string | null; group?: string };

// Exact editorial notes from the catalog, not eligibility rules or inferred benefits.
const readerNotes: Record<string, string | null> = {
  "입력에 기록된 개별 요건": null,
  "입력 후보에 기재된 대상; 지자체 주소만으로 주민자격을 추가 추정하지 않음": "참여 대상은 운영기관의 최신 안내에서 확인해 주세요.",
  "참여 항목/기업별 매뉴얼을 따른다. 전체기업 공통 설정 완료 boolean이 아님.": "이용할 참여기업의 해당 실천 항목 안내를 확인해 주세요.",
  "일반 A01 동절기 지원과 중복 불가": "일반 동절기 지원과 중복해서 받을 수 없어요.",
  "A02 대상에서 제외": "해당 지원 대상에서 제외돼요.",
  "기존 자료": "이전 안내 기준이에요. 현재 적용 여부를 확인해 주세요.",
  "기존 자료상 15% 유형이나 2026 본문 미열람": "현재 유형별 지원 비율은 공식 안내에서 확인해 주세요.",
  "기존 자료상 30% 유형; 2026 본문 미열람": "현재 유형별 지원 비율은 공식 안내에서 확인해 주세요.",
  "기존 자료상 30% 유형; 각 유형·비율 2026 본문 미열람": "현재 유형별 지원 비율은 공식 안내에서 확인해 주세요.",
  "현재 사업 검색결과의 구매 인정 시작일": "구매일이 이 날짜 이후인지 확인해 주세요.",
  "학생·학교 대상이라는 기존 설명은 있으나 2026 회차 상세 원문 미확인": "학생·학교의 참여 대상과 절차는 이번 회차 모집 안내에서 확인해 주세요.",
  "초과 이용금액 환급 방식으로 소개되나 공식 K-패스 세부 본문 접근 실패": "초과 이용금액의 환급 기준은 최신 K-패스 안내에서 확인해 주세요.",
  "입력 확보 2026 안내 기준; 동별 마감시간 차이는 미확인": "2026년 안내 기준이에요. 방문할 동주민센터의 마감시간을 확인해 주세요.",
  "입력 기준 모집 종료 또는 접수 마감": "확인된 회차는 모집이 마감됐어요.",
  "현재 신규모집으로 안내하지 않음": "다음 모집 여부는 공식 안내에서 확인해 주세요.",
  "75% 수치 기준은 기존 입력 자료와 달리 현재 공식 본문에서 확인하지 못해 미확정": "퀴즈 통과 점수는 강좌의 최신 안내에서 확인해 주세요.",
};

// MVP: use only reviewed group meanings for these catalog programs.
// Other programs have branch-specific/conditional rules; do not guess their logic.
function conditionGroup(programKey: string, condition: Record<string, unknown>): string | undefined {
  if (!["scheme:G022", "scheme:G027", "scheme:G031"].includes(programKey)) return;
  const { group, group_logic: logic } = condition;
  if (typeof group !== "string") return;
  if (group === "우대 이자지원" && logic === "묶음 안 하나 충족") return "추가 우대 · 기본 조건을 갖추고 이 중 하나";
  if (logic === "묶음 안 하나 충족" || logic === "묶음 안 하나 충족(기존 자료)") return `${group} · 이 중 하나`;
  if (logic === "모두 충족") return "필수 조건 · 모두 충족";
  if (logic === "제외") return "제외·중복 제한";
  if (logic === "제한") return "지원 한도";
  if (group === "성능개선 기준" && logic === "건물유형별 하나 충족") return "성능개선 · 해당 건물 유형의 기준 충족";
  if (group === "연탄전환 경로별 증빙" && logic === "행동별 분기") return "전환 지원 경로별 증빙";
}

function readerText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  return Object.hasOwn(readerNotes, text) ? readerNotes[text] : text;
}

export function participationInfo(detail: MissionCatalogDetail) {
  const action: ParticipationCondition[] = [];
  const common: ParticipationCondition[] = [];
  const seen = new Set<string>();
  for (const entry of detail.conditions) {
    const title = readerText(entry.condition.requirement);
    if (!title) continue;
    const description = readerText(entry.condition.detail);
    const group = conditionGroup(detail.program_key, entry.condition);
    const condition: ParticipationCondition = { title, detail: description === title ? null : description,
      ...(group ? { group } : {}) };
    const key = JSON.stringify(condition);
    if (seen.has(key)) continue;
    seen.add(key);
    (entry.mapping_basis === "program_common" ? common : action).push(condition);
  }
  const sources = new Map<string, MissionSource>();
  for (const source of [...detail.conditions.flatMap(entry => entry.sources), ...detail.overview_sources]) {
    const url = safeSourceUrl(source.url);
    if (url && !sources.has(url)) sources.set(url, { ...source, url });
  }
  return { action, common, sources: [...sources.values()] };
}
