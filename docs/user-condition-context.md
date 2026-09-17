# 사용자 DB 조건을 대화 메모리로 읽기

Spring `profile`의 `ConditionContextService`가 조회 포트를 호출하고, JDBC 어댑터가 기존 `app.user_detail_context` 결과를 정규화한다. Next 서버의 `createUserConditionLoader`가 공통 Spring 클라이언트로 조회한 뒤 조건 메모리를 초기화하거나 기존 상담에 필요한 입력을 추가한다. DB 쓰기·자격 판정·자연어 해석은 수행하지 않는다.

## 호출 계약

`GET /api/profile/condition-context?programKey=...&actionId=...`

선택 대상은 `householdId`, `homeId`, `vehicleId`다. 소유권은 기존 DB 조회 함수가 확인한다. 결과는 공통 `data/error/requestId` 응답이며 사용자·혜택·입력·미선택 대상·미연결 조건·세대 구성과 `eligibilityStatus=not_evaluated`를 포함한다.

기존 회원 관리의 서버 사용자 문맥을 사용한다. 새 로그인·인증 시스템은 추가하지 않았다. 기존 QA의 `UserPrincipal.getUsername()`은 이메일이므로 UUID로 파싱하지 않는다. [기존 회원 관리 이식](member-accounts.md)의 세션 필터가 확인한 `principal.userId()`를 다음 서버 요청 속성에 넣는다.

```java
request.setAttribute(ConditionContextController.CURRENT_USER_ID, principal.userId());
```

속성 값은 UUID다. 기존 회원/세션 어댑터가 전달하며 클라이언트 헤더·쿼리의 사용자 ID를 복사하지 않는다. 세션 연결은 구현했고 MVC 경계검사에서 확인했다. 실제 DB/API 통합 호출은 아직이며 로그인하지 않은 요청은401이다.

사용자 문맥 없음401, 잘못된 조회 입력400, 없거나 소유하지 않은 대상404, DB 연결 오류503을 반환한다. 대상이 존재하지 않는 경우와 다른 사람의 대상인 경우는 같은404다.

```ts
import { createUserConditionLoader } from "@/lib/server/ai/adapters/user-condition-context";

const load = createUserConditionLoader({ baseUrl: springBaseUrl });
const result = await load({
  authenticatedUserId, // 기존 서버 회원 문맥. 모델/브라우저가 정한 ID가 아님
  programKey, actionId, householdId,
  sessionHeaders: { Cookie: selectedSessionCookie },
  requestId,
}, previousMemory);
if (result.memory) {
  // 성공한 턴에서 호출자가 채택. 실패 시 previousMemory 유지.
  const candidateMemory = result.memory;
}
```

`authenticatedUserId`는 응답·기존 메모리의 소유자 대조에만 사용하고 Spring 쿼리로 보내지 않는다. 서버가 선택한 세션 쿠키만 전달한다. 실제 채팅 경로와 LangGraph에는 아직 등록하지 않았다.

## 값 보존

- DB의 false와 미입력 null을 구분한다. null은 빈 슬롯이며 부정 판정이 아니다.
- 서비스·복지 코드 selector와 대상 ID를 유지한다. `subject_scope`는 대상 정보로 옮긴다.
- 세대의 본인 생년월일·수급 정보는 DB의 같은 본인 기록을 쓰므로 self 슬롯을 공유한다. 다른 세대원은 세대/세대원 ID별로 유지한다.
- 지역별 근거, 기록 시각, 세대원 목록의 완결 여부를 보존한다.
- 대상 미선택과 미연결 조건은 별도 상태로 반환하고 가짜 슬롯이나 false를 만들지 않는다.
- 혜택 재조회는 기존 대화 정정·모름·거절과 최초 DB 스냅샷을 덮어쓰지 않는다. 최신 DB 값으로 강제 갱신하는 기능은 별도다.

## 확인 범위

`frontend`에서 `npm run test:context`: 초기값·대상·출처·HTTP 응답·정정 보존 등5개 단위검사. `backend`에서 `mvn -Dtest=ConditionContextControllerTest,JdbcConditionContextLookupTest test`: 요청 문맥·입력/오류·SQL 매개변수·JSON 변환7개 단위검사. 실제 DB 연결·로그인·모델 호출·통합 대화 검사는 포함하지 않는다.

기존 회원 세션→요청 사용자 속성 연결은 구현했다. 다음 연결 지점은 대화 실행부→조회 함수와 성공한 메모리 채택이다. 별도 QA 브랜치의 상세 대화 개선·미션·지도·DB 마이그레이션은 변경하지 않는다.
