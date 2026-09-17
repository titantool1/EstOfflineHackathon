import "server-only";
import type { FunctionDefinition } from "../conversation-contracts.ts";
import { conditionView, type ConditionMemory } from "./condition-memory.ts";
import { conversationInstructions } from "./conversation-instructions.ts";

export function createConversationContext(input: {
  memory: ConditionMemory;
  tools: FunctionDefinition[];
}) {
  const availableTools = input.tools.map(tool => tool.name);
  const effectiveConditions = conditionView(input.memory);
  return `${conversationInstructions}

현재 실행 문맥은 코드가 검증한 작업 상태이며 원문 대화 이력이 아니다. 앞선 대화와 현재 발화로 의미를 해석하되 설명·가정·제안을 사용자 사실로 취급하지 않는다.
현재 제공 도구(JSON): ${JSON.stringify(availableTools)}
현재 상담의 유효 사용자 조건(JSON): ${JSON.stringify(effectiveConditions)}
유효 사용자 조건은 DB 초기값보다 이 상담에서 검증한 정정을 우선한다. 이 값은 답변 기준이며 영구 프로필 저장을 뜻하지 않는다.`;
}
