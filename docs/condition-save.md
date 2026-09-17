# 대화 조건 저장 1단위

`condition-save.ts`는 한 상담 안에서 성공한 턴의 조건 변경만 모아 저장 포트에 전달한다. 아직 채팅 종료 API나 화면, Spring 어댑터, DB에는 연결하지 않았다.

호출자는 성공 응답이 commit된 직후 `acceptSuccessfulTurn`에 서버 관측 시각과 그 턴의 `ConditionMemory` snapshot을 넘긴다. 실패한 턴에는 호출하지 않는다. `requestSave`는 명시적 상담 종료나 새 상담 전환의 저장 경계에서 호출한다. 실제 연결 시에는 현재 `conversation-session.runTurn(..., { commit })`의 성공 commit 경계에서 snapshot을 채택하고, 기존 `chat-service.close`가 session을 지우기 전에 저장 결과를 확정해야 한다.

`known` 변경은 `set`으로 보존하며 `false`도 값으로 전달한다. 조회만 한 `initial`은 변경으로 보내지 않고 조회 당시 값은 `baseline`으로만 싣는다. 각 변경의 `observedAt`은 처음 채택한 성공 턴의 값을 재시도에도 그대로 쓴다. 포트 요청은 복사 후 freeze하여 호출자나 포트의 변경이 고정된 시도를 바꾸지 못하게 한다.

`unknown`과 `refused`만으로는 기존 저장 사실을 유지하거나 지우지 않는다. 앞선 성공 턴의 미저장 후보가 있으면 분류를 기다리는 동안 메모리에 그대로 두지만, `pending_resolution`으로 전체 포트 호출을 막으므로 그 후보를 저장하지 않는다. 서버의 별도 검증 경계가 같은 slot과 현재 turn에 `clear_saved_fact` 또는 `retain_saved_fact`를 붙여야 한다. `retain_saved_fact`는 임시 후보를 제거해 DB의 기존 사실을 건드리지 않고, `clear_saved_fact`만 clear 후보로 교체한다. 이 값은 신뢰 표식 자체가 아니며, 후속 연결에서 인증된 현재 요청과 사용자의 명시 의도를 대조한 서버 코드만 만들어야 한다. 이전 turn의 분류는 거부되고, 뒤의 `known` 정정은 이전 clear 후보를 교체한다.

포트의 `saved`만 저장 완료로 취급한다. 예외와 `outcome_unconfirmed` 뒤에는 같은 attempt ID와 고정 요청을 유지하며 버리거나 교체할 수 없다. `rejected`는 명시적인 `releaseRejectedAttemptForCorrection` 뒤에만 교정 턴을 받을 수 있고, 교정된 집합은 새 attempt ID로 요청한다. 이는 자동 rebase가 아니다. 동시에 들어온 같은 attempt는 한 호출을 공유하고 다른 attempt나 새 snapshot 채택은 막는다. `saved`와 `no_changes` 뒤에는 해당 상담 서비스를 terminal로 닫으며, 같은 완료 attempt의 재호출만 이전 결과를 돌려준다.

현재 `SavePort`는 transport-neutral 시험 경계다. Spring 내부 `PrivateFactsStore`에는 HTTP API, 요청 멱등 기록, 사실별 비교 기준이 없고 현재 ConditionMemory의 baseline에도 DB revision이 없다. 따라서 아래 항목은 아직 보장하지 않는다.

- 프로세스 재시작이나 여러 Next 인스턴스를 넘는 attempt replay
- commit 뒤 응답 유실 때의 durable 결과 조회
- baseline과 현재 DB 사실의 정확한 충돌 비교
- 한 트랜잭션 전체 저장, 암호화, 대상 소유권과 관계 제약의 실제 DB 검증
- `clear`를 Spring의 필드 제거 또는 행 삭제에 안전하게 매핑하는 규칙

후속 어댑터는 인증 owner를 다시 확정하고 user scope와 대상 소유권을 검증해야 한다. 사실별 revision 또는 동등한 비교 기준, attempt 결과 저장, 원자적 적용을 Spring 경계에 추가한 뒤에만 위 보장을 제품 동작으로 표시할 수 있다.
