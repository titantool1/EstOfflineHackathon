# 회원가입·세션·닉네임

기존 QA의 이메일/비밀번호 가입, Spring 서버 세션, CSRF, 세션 ID 교체 방식을 팀 구조로 옮겼다. Next는 입력 화면과 쿠키 중계를 담당하고 Spring identity가 가입·로그인·회원 식별을 담당한다. 기존 QA 앱/계정/DB는 변경하거나 복제하지 않는다.

## 사용자 동작

- `/signup`: 이메일·비밀번호·선택 닉네임 입력. 가입 후 로그인하고 `/profile`로 이동한다. 가입은 성공했으나 자동 로그인이 실패하면 로그인 링크를 표시한다.
- 닉네임의 앞뒤 공백을 제거한다. 누락/null/빈 문자열/공백만 입력하면 Spring이 `에코쭙`과 랜덤 숫자6자리(100000–999999)를 붙여 한 번 생성·저장한다.
- 명시한 닉네임은20자 이하이며 줄바꿈·제어문자는 허용하지 않는다. Unicode 코드 포인트 기준이다. 닉네임은 표시 이름이므로 중복을 허용하고 사용자 구분은 UUID로 유지한다.
- `/login`, `/profile`: 로그인, 저장된 닉네임/이메일 조회, 로그아웃. 닉네임 변경과 관심사 온보딩 이식은 이번 범위가 아니다.

## 경계와 저장

`AccountController` → `AccountService.Accounts` → `JdbcAccounts`. 가입 트랜잭션 안에서 기존 `users` UUID, 새 `user_accounts` 계정, 빈 `user_profiles`를 함께 만든다. 비밀번호는 기존 PasswordEncoder 방식으로 해시하고 응답에는 반환하지 않는다.

Flyway `V3__member_accounts.sql`은 계정 테이블만 추가한다. 적용된 V1/V2와 개인화 스키마는 변경하지 않는다. 현재 작업은 코드/단위검사/푸시이며 실행 중 DB에는 아직 V3를 적용하지 않았다. 다음 배포 또는 `./scripts/setup-db.sh`의 Spring 시작 때 적용된다.

| 경로 | 용도 |
|---|---|
| GET `/api/auth/csrf` | 기존 세션 방식의 CSRF 토큰 |
| POST `/api/signup` | `{email,password,nickname?}` 가입 |
| POST `/api/auth/login` | 이메일/비밀번호 로그인 |
| GET `/api/auth/me` | `{userId,email,nickname}` 조회 |
| POST `/api/auth/logout` | 세션 종료 |

공통 `data/error/requestId` 계약을 사용한다. 가입·로그인·로그아웃에는 CSRF 토큰이 필요하다. Next는 지정한 세션 경로와 Cookie/Content-Type/X-CSRF-TOKEN만 중계하고 Set-Cookie를 브라우저에 전달한다. 닉네임 생성은 브라우저에서 하지 않는다.

기존 QA와 같은 localhost의 다른 포트에서 실행하더라도 쿠키가 충돌하지 않도록 팀은 `ECOTEAMSESSION`을 쓴다. HttpOnly·SameSite=Lax·30분 세션이며 HTTPS 배포에서는 `SESSION_COOKIE_SECURE=true`를 설정한다. 서버 재시작 시 세션은 사라져 다시 로그인한다.

`SessionConfiguration.MemberContextFilter`가 세션의 `MemberPrincipal.userId()`를 개인화 조회의 `eco.currentUserId` 요청 속성으로 연결한다. 로그인 이름(이메일)을 UUID로 파싱하거나 브라우저 사용자 ID를 신뢰하지 않는다. 개인화 조회 함수와 LangGraph의 실제 연결은 별도 작업이다.

## 검사와 후속

백엔드: `mvn -Dtest=AccountServiceTest,SessionConfigurationTest test`. 닉네임·가입 처리4개와 세션/CSRF/개인화 소유자 전달의 MVC 경계4개. 저장소는 mock이며 실제 DB를 띄우지 않는다.
프론트: `npm run test:account`5개. 닉네임 전달, CSRF 갱신, 저장된 닉네임 반환, 쿠키 중계와 실패 처리. 변경 파일의 타입 검사도 수행했다.

사용자 요청대로 실제 DB 마이그레이션 실행·브라우저 가입·Next→Spring→DB 통합검사는 후속으로 남긴다. 기존 사용자 DB 조회/메모리 단위검사12개 결과는 별도 근거로 유지한다.
