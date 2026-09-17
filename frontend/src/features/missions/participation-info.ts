import type { MissionCatalogDetail, MissionSource } from "./detail-contract.ts";
import { safeSourceUrl } from "../sources/source-reference.ts";

export type ParticipationCondition = { title: string; detail: string | null };

// Exact editorial notes from the catalog, not eligibility rules or inferred benefits.
const readerNotes: Record<string, string | null> = {
  "입력에 기록된 개별 요건": null,
  "입력 후보에 기재된 대상; 지자체 주소만으로 주민자격을 추가 추정하지 않음": "참여 대상은 운영기관의 최신 안내에서 확인해 주세요.",
  "참여 항목/기업별 매뉴얼을 따른다. 전체기업 공통 설정 완료 boolean이 아님.": "이용할 참여기업의 해당 실천 항목 안내를 확인해 주세요.",
  "일반 A01 동절기 지원과 중복 불가": "일반 동절기 지원과 중복해서 받을 수 없어요.",
  "A02 대상에서 제외": "해당 지원 대상에서 제외돼요.",
};

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
    const condition = { title, detail: description === title ? null : description };
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
