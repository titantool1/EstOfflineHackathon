# 대화 중 조건 메모리

`frontend/src/lib/server/ai/application/condition-memory.ts`는 DB 초기값과 대화 변경값을 분리하는 순수 상태 모듈이다. SDK·LangGraph·HTTP·DB에 의존하지 않으며 JSON으로 직렬화할 수 있다. 아직 실제 채팅 경로에는 연결하지 않았다.

```text
Spring 사용자 문맥 조회 → 입력 정의·초기값으로 변환 → createConditionMemory
사용자 발화 해석 → 등록된 slotId의 변경값 → applyConditionChanges
조건 비교에 쓸 현재 값 → readConditionFact
```

## 정의와 값

입력 정의는 `inputKey`, `selector`, `target`, `scope`, `valueType`으로 구성한다. DB의 공통 키·selector·대상 ID를 유지하고, 서비스·세대원·주택·차량·상담 건을 한 값으로 합치지 않는다. slot ID는 이 요소로 생성한다. 모델이 정의나 대상 ID를 새로 만들지 않고 서버가 제공한 slot ID만 선택하게 연결한다.

- `scope=user`: 동일 사용자의 여러 혜택에서 재사용할 값. 서비스 가입은 `selector.service_code`로 구분한다.
- `scope=benefit`: 특정 혜택 상담의 값. 혜택 ID로 구분한다.
- `scope=case`: 특정 구매·실천 건의 임시 값. 새 건은 새 ID를 쓰고 이전 건은 `clearConditionCase`로 제거한다.

각 slot의 `initial`에는 DB 값과 기록 시점·출처가 남고, `change`에는 대화에서 갱신한 값과 현재 턴의 인용이 남는다. 읽을 때는 change를 우선한다. 미입력(`missing`), 명시적 모름(`unknown`), 거절(`refused`), 실제 부정(`known/false`)을 구분한다. unknown/refused로 바꾼 항목에 DB 값을 다시 채우지 않는다.

`addConditionInputs`로 다른 혜택의 필요 항목을 추가할 수 있다. 같은 항목은 기존 초기값·정정을 유지한다. DB 최신값 재조회와 충돌 해소는 이 함수의 역할이 아니며 후속 연결에서 정한다. 상태는 상담 단위로 보관하고 계정 변경 시 새로 생성한다. 전역 사용자 공용 변수에 보관하지 않는다.

## 사용 예

```ts
import { createConditionMemory, conditionSlotId, applyConditionChanges, readConditionFact }
  from "@/lib/server/ai/application/condition-memory";
import type { ConditionInput } from "@/lib/server/ai/application/condition-memory";

const input: ConditionInput = {
  inputKey: "membership.is_member",
  selector: { service_code: "eco_mileage" },
  target: { kind: "self", id: authenticatedUserId },
  scope: { kind: "user" },
  valueType: "boolean",
};
const memory = createConditionMemory(authenticatedUserId, [{ input, stored: {
  value: false,
  evidence: [{ observedAt: "2026-09-17T00:00:00Z", sourceKind: "user_statement" }],
} }]);
const candidate = applyConditionChanges(memory, authenticatedUserId,
  { id: "turn-1", text: "이제 가입했어" },
  [{ slotId: conditionSlotId(input), status: "known", value: true, quote: "가입했어" }]);
readConditionFact(candidate, conditionSlotId(input)); // known/true, source.kind=conversation
// memory는 그대로다. 턴이 성공했을 때 호출자가 candidate를 채택한다.
```

위 발화 해석 결과는 예시다. 이 모듈은 자연어를 해석하지 않는다. 현재 턴의 실제 인용 여부와 값 타입을 검사하며, 발화와 값의 의미 일치·짧은 답의 pending 질문 연결·과거 턴과의 지시대상 연결은 모델/대화 실행부 책임이다. 정책 조건 충족 판정과 DB 영구 저장도 하지 않는다. 실패한 턴의 candidate는 버리면 된다. 동일 상담의 턴 순서·동시 갱신은 이후 실행부에서 제어한다.

## 기존 DB와의 연결 경계

팀 `database/user-storage.sql`의 `user_benefit_context`와 `detail-storage.sql`의 `user_detail_context`를 확인해 정규화 입력 계약을 만들었다. 현재 모듈이 SQL 반환 JSON을 직접 파싱하는 것은 아니다. 실제 조회 어댑터가 연결될 때 다음 변환을 수행한다.

| DB 조회값 | 메모리 입력 |
|---|---|
| `input_key`, `selector` | 동일 의미의 `inputKey`, `selector` |
| 기본 입력 정의 또는 상세 `value_type` | `valueType` |
| `user_fact.value`, `observed_at`, `source_kind` | `stored.value`, `stored.evidence` |
| 지역별 evidence | 지역별 기록을 모두 보존하는 evidence 배열 |
| `by_member` | 세대 ID·세대원 ID별 slot. 다른 사람의 사실을 합치지 않음 |
| `selected_entities`, `entity_id` | 서버가 검증한 대상 ID |
| null 사실 | `stored=null`; 빈 슬롯으로 시작 |
| `not_selected` 또는 미연결 조건 | 대상 선택/매핑 필요 상태로 별도 유지. 임의 ID나 false로 채우지 않음 |

API 소유권 검사는 Spring이 담당한다. 이 모듈의 userId 일치 검사는 인증이나 대상 소유권 조회를 대신하지 않는다. DB의 `eligibility_status=not_evaluated`와 전체 미연결 조건도 유지해야 한다. 타입 검사는 날짜·숫자·문자열 등의 형식만 다루고 조건식·업무 제한값을 복제하지 않는다.

## 검사와 다음 단계

`frontend`에서 `npm run test:memory`. 합성 입력으로 초기화·정정·미확인/거절·대상/서비스 분리·새 건·실패 시 불변성과 DB 값 형태를 검사한다. 기존 시험의 공통 정보 유지·정정·건 경계를 사용했으며, 특정 단어 정규식과 옛 혜택 필드는 이식하지 않았다.

다음은 Spring 조회 결과를 이 계약으로 변환하는 함수와 LangGraph에서 candidate를 채택하는 지점을 연결하는 일이다. 실제 DB/API·자연어 해석 품질·영구 저장·운영 상담 저장소는 아직 구현/검증하지 않았다.
