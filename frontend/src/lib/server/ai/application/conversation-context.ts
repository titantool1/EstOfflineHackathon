import "server-only";
import type { FunctionDefinition } from "../conversation-contracts.ts";
import { conditionView, type ConditionMemory } from "./condition-memory.ts";
import { conversationInstructions } from "./conversation-instructions.ts";

// Answer generation needs the meaning and effective value, not storage keys or owner IDs.
const conditionNames: Record<string, string> = {
  'person.birth_date': '생년월일', 'membership.is_member': '가입 여부',
  'location.region_ids': '등록된 지역', 'welfare.has_status': '복지 자격',
  carbon_green: '탄소중립포인트 녹색생활실천', eco_mileage: '서울시 에코마일리지',
  climate_action_15: '기후행동 1.5℃', dobong_carbon: '도봉 탄소공감마일리지', seocho_coin: '서초코인',
  registered_residence: '주민등록 거주지', work: '직장', study: '학교', business: '사업장',
  education_benefit: '교육급여', housing_benefit: '주거급여', livelihood_benefit: '생계급여',
  medical_benefit: '의료급여', near_low_income: '차상위계층', veteran: '국가유공자',
};
function answerConditions(memory: ConditionMemory) {
  return conditionView(memory).map(({ input, fact }) => ({
    항목: [...Object.values(input.selector).map(value => conditionNames[value] ?? value), conditionNames[input.inputKey] ?? input.inputKey].join(' '),
    대상: input.target.kind === 'self' ? '본인' : input.target.kind,
    상태: { known: '확인됨', missing: '미입력', unknown: '모름', refused: '공개 거절' }[fact.status],
    값: fact.value,
    근거: fact.source?.kind === 'database' ? '저장된 정보' : fact.source ? '이번 상담에서 확인한 정보' : null,
  }));
}

export function createConversationContext(input: {
  fixedConditions?: boolean;
  clarification?: { question: string; slots: number[] } | null;
  memory: ConditionMemory;
  tools: FunctionDefinition[];
}) {
  const availableTools = input.tools.map(tool => tool.name);
  const effectiveConditions = input.fixedConditions ? answerConditions(input.memory) : conditionView(input.memory);
  return `${conversationInstructions}

현재 실행 문맥은 코드가 검증한 작업 상태이며 원문 대화 이력이 아니다. 앞선 대화와 현재 발화로 의미를 해석하되 설명·가정·제안을 사용자 사실로 취급하지 않는다.
조건 해석·검증은 답변 전에 코드가 수행했다. 조건 갱신 도구가 없으면 직접 갱신하려 하지 않는다. 답변의 사용자 사실은 아래 유효 조건을 따르고 unknown/refused/missing을 과거 값으로 복원하지 않는다. refused는 공개 거절로 설명한다. 다음 상담에서도 기억되는지는 종료 저장 성공에 달렸으며 미리 약속하지 않는다.
이번 턴 확인 질문(JSON): ${JSON.stringify(input.clarification?.question ?? null)}
확인 질문이 있으면 그 대상을 확정하지 말고 질문한다. 독립적으로 반영된 정보는 반영됐다고 안내할 수 있다. 명확한 대상 답변은 이미 반영돼 있을 수 있으므로 불필요하게 다시 확인하지 않는다.
현재 제공 도구(JSON): ${JSON.stringify(availableTools)}
현재 상담의 유효 사용자 조건(JSON): ${JSON.stringify(effectiveConditions)}
유효 사용자 조건은 DB 초기값보다 이 상담에서 검증한 정정을 우선한다. 이 값은 답변 기준이며 영구 프로필 저장을 뜻하지 않는다.`;
}
