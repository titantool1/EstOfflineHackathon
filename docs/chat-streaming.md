# 채팅 진행 표시와 답변 스트리밍

`POST /api/chat`에 `Accept: application/x-ndjson`을 보내면 같은 출처·요청 형식·서버 회원 인증을 확인한 뒤 스트림을 반환한다. 헤더가 없는 기존 호출은 JSON envelope를 유지한다. DB 저장 시점이나 새 상담/종료 동작은 이번 변경 대상이 아니다.

각 줄은 JSON 객체다.

- `progress`: 실제 모델/도구 실행에 따른 `stage` (`thinking`, `searching`, `reading`, `checking_conditions`, `updating_conditions`, `answering`). 조건 반영 문구는 이번 상담 메모리를 의미한다.
- `delta`: 생성된 임시 답변의 `text`. SDK의 출력 텍스트만 전달하고 추론·도구 인자·도구 원본 결과는 전달하지 않는다.
- `reset`: 현재 임시 답변을 버린다. 모델 재호출과 도구 호출 전 발생한다.
- `done`: 기존 세션 commit이 성공한 뒤 확정 `data: { conversationId, message: { role: 'assistant', text } }`를 전달한다.
- `error`: 공개 오류 `code`, `message`를 전달한다. 스트림이 시작된 뒤에는 HTTP 상태 대신 이 이벤트로 실패를 알린다.

브라우저는 완료 전 글을 ‘작성 중인 답변’으로 표시한다. 도구 호출 전 글은 초기화하고, 실패·잘린 스트림은 성공으로 반환하지 않는다. 출처 링크는 완료된 답변에서 렌더링한다. 화면을 나가면 진행 요청을 취소하며 서버는 취소 신호를 모델에 전달한다. 생성 응답 ID는 `response.created`부터 보존해 중도 실패에도 정리할 수 있다.

도구/회원 조건 정보가 필요한 앞단 대기는 그대로 존재한다. 이 변경은 전체 모델 호출 횟수나 총 처리시간 감소를 주장하지 않는다. 로컬 HTTP 대역·실제 Next 화면으로 완료 전 표시와 실패/취소를 확인했으며 실제 모델과 운영 프록시의 첫 표시/완료 시간은 배포 전 별도 확인이 필요하다. 응답은 `no-store, no-transform`, `X-Accel-Buffering: no`를 사용한다.

검사: `tests/chat-stream.test.ts`와 기존 conversation provider/flow/session 검사. 기존 검색 장애 뒤 도구 재시도 중단도 유지한다. 반응형 브랜치의 `ChatPanel.tsx`와 병합할 때 레이아웃·스크롤 변경과 스트리밍 상태 처리를 함께 보존해야 한다.
