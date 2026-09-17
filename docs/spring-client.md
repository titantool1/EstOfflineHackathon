# Next 서버의 공통 Spring 클라이언트

`frontend/src/lib/server/spring-client.ts`는 서버에서 Spring HTTP API를 호출하는 공통 연결부다. 업무별 성공 응답은 호출 함수가 검사하고, 통신·공통 응답·오류 변환은 이 클라이언트가 처리한다. 브라우저에서는 직접 import하지 않는다.

현재 연결한 기능은 `health.ts`의 `checkSpringHealth()`와 `GET /api/health`다. 미션·지도·사용자 API와 AI 도구는 각 기능의 계약에 맞춰 같은 클라이언트를 사용할 수 있다. Spring 업무 API·인증 방식·SQL은 이 변경에서 만들지 않았다.

```ts
import { createSpringClient } from "@/lib/server/spring-client";

type Health = { status: "UP"; database: "UP" };
const isHealth = (value: unknown): value is Health =>
  value !== null && typeof value === "object"
  && "status" in value && value.status === "UP"
  && "database" in value && value.database === "UP";

const spring = createSpringClient({ baseUrl: process.env.SPRING_BASE_URL! });
const result = await spring.request("/api/health", {
  requestId, // 요청 문맥에서 전달. 없거나 잘못된 형식이면 UUID 생성
  signal,    // 호출자가 취소할 때 전달. 생략 가능
  validate: isHealth,
});
// result.status: HTTP 상태
// result.body: { data, error, requestId }
```

## 요청 규칙

- `baseUrl`은 서버 설정의 HTTP(S) origin이다. 사용자 이름/비밀번호·하위 경로·query·fragment는 넣지 않는다.
- `path`는 서버 코드가 정한 `/api/...` 경로다. 사용자 입력으로 전체 URL을 만들지 않는다. 값은 `query` 또는 JSON `body`로 전달한다.
- `method`는 기본 GET, 필요 시 POST/PUT/PATCH/DELETE를 지정한다. GET body는 거부한다.
- `query`는 문자열·숫자·불리언을 URL 인코딩하고 undefined만 생략한다. `body`는 JSON 직렬화할 수 있어야 한다.
- `headers`는 서버가 명시적으로 고른 것만 전달한다. 브라우저 헤더 전체를 복사하지 않는다. 인증 전달 방식은 해당 기능에서 정한다. 요청 ID·JSON 헤더는 클라이언트가 설정한다.
- 캐시와 자동 redirect를 사용하지 않는다. 기본 제한시간은 5초이며 응답 body 읽기까지 적용한다. 필요하면 생성 시 `timeoutMs`로 조정한다.

## 응답과 오류

Spring의 JSON `{data, error, requestId}`와 `X-Request-Id`가 보낸 ID에 일치해야 한다. 성공은 error=null이고 `validate(data)`가 통과해야 한다. 빈 목록·nullable 결과도 업무의 validator가 허용하면 정상이다. 이 클라이언트는 JSON 계약용이며 204·파일·스트리밍 응답은 지원하지 않는다.

| 상황 | 반환 |
|---|---|
| Spring의 정상 오류 응답 | 원래 HTTP 상태·오류 코드·메시지 보존, data=null |
| 연결 실패·redirect 거부 | 503 / `BACKEND_UNAVAILABLE` |
| 시간 초과 | 504 / `BACKEND_TIMEOUT` |
| 호출자 취소 | 499 / `REQUEST_CANCELLED` |
| 잘못된 JSON·형식·요청 ID·업무 데이터 | 503 / `BACKEND_INVALID_RESPONSE` |
| 잘못된 path·method·body | 400 / `INVALID_BACKEND_REQUEST`, 전송 안 함 |
| 잘못된 baseUrl·timeout 설정 | 500 / `BACKEND_CLIENT_CONFIG_ERROR`, 전송 안 함 |

공통 형식의 Spring 오류는 의미를 보존하되 SQL·예외 상세 등 민감한 내용을 넣지 않는 책임은 Spring에 있다. 연결 예외·잘못된 응답의 원문은 클라이언트 결과에 싣지 않는다. 쓰기 요청의 반영 여부가 불명확할 수 있어 자동 재시도하지 않는다. 화면의 로딩 해제·입력 복구·재시도 안내는 프론트가 맡는다. 취소된 브라우저가 499 본문을 받는다는 보장은 없으며 이는 서버 호출의 취소 결과다.

## 검사

`frontend`에서 `npm run test:server`로 GET/JSON 요청, 오류 계약·요청 ID·형식 검증, 연결 실패와 재시도 없음, 실제 로컬 HTTP 시간 초과·body 지연·취소·redirect 거부를 검사한다. 외부 Spring·모델 호출은 없다.

저장소 루트의 `scripts/check-app.py`는 별도 Compose 프로젝트에서 실제 Next→Spring→PG의 정상·요청 ID·DB 중단/복구·Spring 중단/복구를 확인한다. 기존 서비스와 분리하고 검사 자원을 정리한다. 인증·업무별 API 연결 완료를 대신하는 검사는 아니다.
