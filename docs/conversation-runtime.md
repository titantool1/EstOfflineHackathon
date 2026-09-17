# 대화 실행부 이식

**진행 중인 구현 기준점이다.** 관련 단위검사 통과는 실제 채팅 연결·복원 설계 완료를 뜻하지 않는다. 아래 알려진 결함과 미정 정책을 해결한 뒤 API에 연결한다.

기존 QA/공개 도구 시험에서 검증한 OpenAI Conversations·Responses의 model→tool→model 흐름을 TypeScript/LangGraph로 연결했다. 이번은 실행부와 도구/메모리 조립까지다. 현재 `/api/chat`과 화면은 아직 기존 FastAPI 경로이며 이 실행부를 호출하지 않는다.

## 재사용 경계

- `createCatalogTools`: 기존 `search_catalog`/`get_catalog_action`, Spring HTTP 조회·출처·0건/오류 구분.
- `createUserConditionLoader`: 기존 회원 세션으로 DB 초기값을 읽고 조건 메모리로 변환.
- `condition-memory.ts`: 초기값/정정값·대상/selector 분리, 현재 발화 인용 검사, unknown/refused/false/missing 구분.
- 새 graph는 모델 선택과 function call/output 순환을 연결한다. 새 자격 판정기나 DB 쓰기 기능은 추가하지 않았다.

## 코드 책임

| 위치 | 책임 |
|---|---|
| `ai/conversation-contracts.ts` | 서버 대화 상태와 provider/function call 계약 |
| `ai/application/conversation-flow.ts` | model→tool→model, 종료/호출상한/오류/취소 |
| `ai/application/conversation-session.ts` | 사용자 격리, 한 세션의 동시 실행 차단, 성공 commit·실패 복원 |
| `ai/application/conversation-instructions.ts` | 검증된 공개도구 v2 지시와 현재 개인화 지원 범위 |
| `ai/tools/conversation-tools.ts` | 공개 도구와 개인화 읽기·임시 정정 도구 연결 |
| `ai/adapters/openai-conversation.ts` | SDK Conversations/Responses와 provider 자원 정리 |
| `ai/runtime.ts` | 환경값과 실제 SDK/HTTP 구현 조립 |

Spring은 회원·DB·소유권을 맡고 Next는 AI 실행·대화 상태를 맡는다. 조회 SQL이나 정책 조건식은 Next에 복제하지 않는다. 기존 고정 검색 그래프는 API 전환 전까지 유지한다.

## 서버 호출 예

```ts
const runtime = await createConversationRuntime();
const session = runtime.createSession(authenticatedUserId);
const result = await runtime.runTurn(session, {
  authenticatedUserId, turnId, text,
  sessionHeaders: { Cookie: selectedSessionCookie },
  requestId,
  // householdId/homeId/vehicleId는 서버에서 선택한 대상이 있을 때만 전달
}, {
  signal,
  commit: async completed => {
    // 실제 대화 API 연결 시, 답변 저장/채택 성공을 여기서 확인한다.
    await saveCompletedTurn(completed);
  },
});
// result.text를 사용한다. 실패하면 이전 session.memory/history가 유지된다.
// 로그아웃/대화 종료/만료 처리에서 provider 자원도 정리한다.
await runtime.closeSession(session);
```

`saveCompletedTurn`은 호출 계약을 설명하는 예시이며 팀의 실제 대화 저장 API는 아직 연결하지 않았다. session과 authenticatedUserId는 서버에서 관리한다. 브라우저가 보낸 session/memory/provider ID를 그대로 복원하지 않는다. 사용자별로 분리해 보관하고, 동일 대화 재접속·보존기간·다중 프로세스 저장은 실제 API 연결 때 다룬다. 현재 runner의 동시 실행 차단은 같은 프로세스의 같은 session 객체 범위다.

## 도구와 상태

현재 턴의 검색 응답에서 얻은 복합 ID만 상세 조회할 수 있고, 상세 조회 성공 뒤에만 `load_user_conditions`를 실행한다. 개인화 조회에는 서버가 받은 세션과 선택 대상만 사용한다. 모델이 사용자 ID나 세대/주택/차량 ID를 만들 수 없다.

`update_conditions`는 이미 등록된 슬롯만 현재 발화의 정확한 인용과 함께 갱신한다. 변경은 working memory에만 적용하고 답변 생성 및 호출자의 `commit` 성공 뒤 session에 반영한다. 의미가 모호한 수긍·다른 사람·새 구매 건의 해석은 모델 지시로 제한하며 정확한 인용 자체가 의미적 정확성을 증명하지는 않는다. 이 실행부는 새 사람/새 구매 건 슬롯 등록이나 질문 상태기를 추가하지 않는다.

정상 조회0건과 조회 오류를 구분한다. 도구 오류는 민감한 원문 대신 코드만 모델에 전달하고 같은 턴의 상한 안에서 수정할 수 있다. 모델6회·도구5회, 응답당 함수호출1개, 검색3회·상세2회까지다. 전역85초/SDK45초 제한과 취소를 전달하며 SDK 자동 재시도는0이다.

Responses에 같은 Conversation ID를 전달한다. 도구 결과는 call_id에 연결해 다음 Responses input으로 넣으며 최종 답변을 수동으로 중복 append하지 않는다. SDK response ID는 working memory와 독립적으로 기록한다.

실패한 턴의 provider 대화는 다시 쓰지 않고 retire한다. items→conversation→responses 정리를 시도하고 실패한 ID는 session.retired에 남겨 다음 실행/명시적 종료 시 재시도한다. provider를 다시 만들 때는 완료된 user/assistant 이력을 사용한다. 현재 코드는 최근20턴을 보관하지만 이는 미확정 구현값이며 아래 복원 요청 크기 결함도 남아 있다. 조건 메모리는 별도로 유지한다. 정리 실패한 상태를 버리거나 종료 hook을 생략하면 외부 자원이 남을 수 있으므로 API 연결 시 이 session 상태도 서버에서 보관해야 한다.

## 연결 전 남은 결함과 결정

- **긴 이력 복원:** runner는 최대40메시지를 보관하고 adapter는 이를 Conversations.create 한 번에 전달한다. 설치 SDK가 명시한 요청당20항목 한도와 맞지 않는다. 기존 QA는 완료 턴마다 사용자/답변 두 항목씩 복원했다. 전송을 나누는 방식과 대화를 얼마나 기억할지는 별개다. 복원 도중 실패해도 생성한 provider ID를 잃지 않는 계약까지 함께 정해야 한다.
- **회원 문맥 역의존:** `identity/adapter/SessionConfiguration`이 `profile/api/ConditionContextController`의 사용자 속성 상수를 참조한다. 다른 모듈 컨트롤러에 의존하지 않는 작은 공용 계약으로 정리해야 한다.
- **보관·완료 계약:** 상담 종료/재시작 후 이어가기, 완료 이력과 조건/현재 요청 상태의 일관된 저장, 완료 응답 유실 시 같은 turnId의 상태 확인은 미정이다. 현재 WeakSet 동시 실행 차단은 같은 프로세스/같은 객체만 보호한다.
- **검색·요청 상태:** 공개 검색은 단어별 부분 문자열 AND이며 자료가 있어도 표현에 따라0건이 될 수 있다. 요청 상태 후보는 별도 시험 단계다. 검색1회의0건을 요청 전체 종료로 바꾸지 않도록 연결 기준을 정해야 한다.

기존 QA의 Spring 대화는 프로세스 메모리에 보관하며 재시작 시 사라진다. 당시 복원 이력은 최근10턴이었다. 이 구현 사실을 제품의 보관 정책으로 확정하지 않는다. 현재 변경은 동결된 검색 후보나 요청 상태 후보를 가져오지 않았다.

## 확인 범위와 다음 단계

`frontend`에서 `npm run test:conversation`: graph7, session/도구 연결5, SDK4개 단위검사. 모델은 고정 응답, Spring은 fetch 대역으로 검사했다. SDK 역시 실제 클라이언트에 fake fetch를 주입했으며 유료 모델/API 호출은 없다. 변경 파일 타입 검사도 통과했다.

별도 환경의 공개 도구 시험 v2를 기반으로 했지만, 이번 개인화 지시와 합쳐진 모델의 자연어 품질을 실제 호출로 검증한 것은 아니다. 기존 QA의 요청 상태/수락·보충 및 답변 근거 개선 후보는 자동으로 이식하지 않았다. 그 결과를 확인해 후속으로 반영한다.

다음은 위 복원·보관 방법을 합의하고 알려진 결함을 보완하는 일이다. 그 뒤 회원 문맥→대화 session 보관·commit→Next 채팅 API/화면을 연결한다. 그때 기존 FastAPI 경로를 전환하고 기존 환경에서 검증한 시나리오로 달라진 경계만 확인한다. 현재16개 검사는 긴 이력 복원과 실제 모델의 자연어 품질을 검증하지 않았다.
