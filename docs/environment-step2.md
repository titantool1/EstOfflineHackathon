# 2단계: 웹·Spring·PostgreSQL 연결 골격

## 범위와 실행

기존 Next 화면을 실행하며 `GET /api/health` 한 경로로 실제 Spring·PG 연결을 확인한다. 상태 조회를 미션·로그인·챗 기능 완성으로 보지 않는다. 외부 모델·카카오 호출과 데이터 적재는 없다. 기존 화면/API·FastAPI 소스는 보존하며 기존 검색 서버의 실행 연결은 후속 단계다.

```bash
python3 scripts/setup-local.py
./start.sh
curl --fail http://127.0.0.1:3300/api/health
./stop.sh
```

`start.sh`는 app 프로필로 웹·Spring·PG·ES를 실행한다. `stop.sh`는 app/tools 프로필까지 멈추고 데이터를 보존한다. DB·ES만 실행하려면 `docker compose up -d --wait`, 편집 중인 웹을 직접 실행하려면 `cd frontend && npm ci && npm run dev -- --port 3300`을 사용한다. 이때 Docker 웹을 먼저 멈추고 `.env.local`의 `SPRING_BASE_URL`이 로컬 Spring 포트와 맞는지 확인한다. Docker 웹의 Spring 주소는 Compose가 `http://backend:8080`으로 지정한다.

## 책임과 후속 구현 기준

```text
frontend/src/app/api/health/route.ts   HTTP 응답
  → frontend/src/lib/server/spring-client.ts   서버 전용 호출·timeout·응답 검증
  → backend/.../health/api/HealthController    HTTP 입구
  → health/application/HealthService          연결 확인 결과 구성
  → health/application/DatabaseProbe          DB 확인 포트
  → health/adapter/JdbcDatabaseProbe          JDBC SELECT 1
```

공통 응답·예외 변환·요청 ID는 `backend/.../common/api`에 둔다. 다음 기능도 기능별 모듈 안에서 API·응용 처리·외부 접근을 구분하고, 업무 규칙이 생길 때 DB나 모델에 의존하지 않는 핵심 함수를 둔다. 비어 있는 기능 모듈을 미리 일괄 생성하지 않는다. 이번에는 테이블을 만들지 않아 팀의 사용자·혜택 스키마 결정을 선점하지 않는다.

## API 계약

웹과 Spring의 `GET /api/health`는 다음 응답을 쓴다.

```json
{"data":{"status":"UP","database":"UP"},"error":null,"requestId":"요청별-ID"}
```

DB 연결 실패는 HTTP503이며 `data=null`, `error={"code":"DATABASE_UNAVAILABLE","message":"데이터베이스 연결을 확인해 주세요."}`를 반환한다. 웹에서 Spring 연결 실패는 HTTP503/`BACKEND_UNAVAILABLE`, 예상과 다른 응답은 `BACKEND_INVALID_RESPONSE`다. Spring의 HTTP404/405는 원래 상태를 유지하고 공통 오류 형태로 반환한다. 일반 예외는 HTTP500/`INTERNAL_ERROR`다.

웹은 요청마다 ID를 생성해 Spring으로 전달하고 응답 헤더 `X-Request-Id`와 본문에 함께 둔다. Spring 직접 호출은 영문·숫자·밑줄·하이픈1~64자의 ID만 받아들이며 나머지는 새 ID로 바꾼다. 응답은 `no-store`, 웹의 외부 호출 제한은5초, PG 연결·쿼리 대기도 짧게 제한한다. DB 주소·자격증명·예외 본문은 클라이언트 오류 응답에 넣지 않는다. 공통 예외 로그는 요청 ID·오류 코드·예외 종류만 남긴다.

현재 포트는 로컬에만 열고 상태 조회에는 인증을 두지 않았다. 사용자 데이터를 다루는 API를 붙일 때 인증·소유권 검사와 세션 중계를 함께 구현해야 한다. health 성공은 SELECT 1 성공이며 업무 스키마·검색 인덱스·AI 준비 여부를 뜻하지 않는다.

## 키 전달

TXT 가져오기는 `.env`와 `frontend/.env.local`을 갱신한다. 서버 키는 웹 런타임에만 전달한다. 공개 지도 JavaScript 키는 Compose 빌드 인자이므로 변경 후 `./start.sh`로 웹을 다시 빌드한다. Docker 빌드 컨텍스트에서는 `.env*`를 제외한다. 공개 키가 없는 상태에서도 상태 조회와 기존 페이지는 열리지만 지도 SDK·외부 기능의 동작은 별도다.

## 검증과 한계

2026-09-17 실행: 설정 테스트3개, Spring 계약 테스트4개, 새 웹 코드 린트·전체 빌드, 실제 정상·장애·복구 검사 모두 통과했다. 기존5페이지 HTTP200, 기존 실행 서비스10개 보존, 검사 컨테이너·볼륨·네트워크 잔여0을 확인했다.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
python3 scripts/check-app.py
```

검사 스크립트는 `eco-app-scaffold-check`라는 독립 프로젝트와33301/28081/35434 포트를 쓴다. 같은 이름의 자원이나 포트가 있으면 중단한다. 웹·Spring·PG를 빌드/실행한 뒤 실제 정상 요청, 요청 ID, 404/405, 기존5페이지 HTTP200, DB·Spring 중단 시503과 복구를 확인한다. finally에서 해당 프로젝트만 볼륨까지 정리한다. 기존 서비스의 ID·시작 시각·실행 상태를 대조한다. 결과는 `.local/app-check.json`, 실행 로그는 `.local/app-check.log`에 남긴다. 빌드 이미지·캐시는 다음 개발을 위해 보존한다.

Spring 이미지는 Maven verify로 계약 테스트4개를 실행한다. 웹 이미지는 새 파일 린트와 전체 Next 빌드·타입 검사를 수행한다. 설정 가져오기 테스트3개도 실행한다. 실제 검사 결과는 하네스랩의 `evidence/eco-team-environment-2026-09-17/app-check.json`을 따른다. 페이지 HTTP200은 브라우저 상호작용 QA나 모델·지도 API 성공을 보증하지 않는다. ES/Nori는1단계 검증 범위이며 이번 검사에서 다시 기동하지 않는다.

후속 순서: 서버 전용 LangGraph·임베딩 실행 경계 → 실제 기능 API와 인증·프론트 연결. 각 단계가 검증되면 main에 반영한다.

참고: [Next standalone 배포](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Next 자체 호스팅·환경변수](https://nextjs.org/docs/app/guides/self-hosting), [Spring Boot 테스트](https://docs.spring.io/spring-boot/reference/testing/). Next 가이드는 설치된16.3.5 문서도 함께 확인했다.
