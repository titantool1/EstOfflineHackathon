# 대화 기능의 구현 위치

메시지 표시·입력·전송 상태를 둔다. LangGraph·모델·키·도구 조립은 `src/lib/server/ai`에 둔다. `/api/chat`은 기존 회원 세션을 확인하고 새 대화 runtime을 호출한다.

`src/app/chat/page.tsx`는 화면 진입점이고 `ChatPanel.tsx`와 `chat-client.ts`가 표시·입력·전송을 맡는다. 생성 중에는 입력과 새 상담 전환을 잠그고, 실패하면 입력을 보존한 채 새 상담을 안내한다.

브라우저는 `{conversationId?, clientRequestId, message}`만 같은 출처 JSON으로 보내고 `{conversationId, message}`를 공통 envelope로 받는다. 동일 출처는 요청 scheme과 표준 `Host`를 기준으로 확인하며 전달 host 헤더는 신뢰하지 않는다. DB와 외부 서비스에 직접 접근하지 않는다. 현재 상담은 Next 프로세스 메모리에서 회원별로 분리되며 서버 재시작 뒤 이어가기, 장기 저장, 응답 유실 복구는 지원하지 않는다.

[전체 구조와 담당 경계](../../../../docs/architecture.md).
