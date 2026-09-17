# 에코줍줍 통합 개발 환경

Next.js·Spring·PostgreSQL·ES/Nori·LangGraph·BGE-M3로 회원·개인화·미션·대화를 연결한 팀 웹이다.

## 현재 배포 상태 (2026-09-18)

**main `f54b22f825b6a7ab16f261b5d600bc97ff25e3e9`를 원격에 반영하고 Spring·Next에 배포했다.** 암호화·조건 저장, 스트리밍·반응형, 미션 두 영역·레벨·사진 기능을 포함한다. 실행 이미지의 코드 기준은 이 커밋이며 이후 문서 커밋과 구분한다. [배포·검사·재기동·원복 기록](docs/deployment-2026-09-18.md).

- 새 상담 또는 응답 완료 후 90초 무활동에서 명시적인 조건 변경을 Spring에 저장하고 대화를 초기화한다. 실제 저장 성공에만 저장 안내를 표시한다. 실패·충돌·결과 미확인도 초기화하며 로그인은 유지한다. [기능 정책](docs/condition-save.md).
- Spring 98개(실제 PG 검사 포함, skip 0), 프런트 189개, 린트·타입·프로덕션 빌드 통과. 운영 백업을 격리 DB에 복원해 별도 키 백업으로 이관·재기동한 뒤 운영 V12까지 적용했다.
- 배포 후 보호 프록시 경유 회원·암호화 동네 저장·미션 추천/완료/진행도·실제 모델 스트리밍·입력 활동·새 상담·재로그인을 확인했다. 외부 비인증 접근은 401이며 QA/앱 Secure·HttpOnly 쿠키도 확인했다.
- 공유 주소: https://hospital-provinces-soap-metallic.trycloudflare.com — 기존 QA 보호 뒤 각자 앱 계정으로 로그인한다. 예전 임시 터널은 호스트 재시작 후 종료되어 새 주소로 재연결했다. 사용자에게 새 카카오 도메인 등록 완료를 확인받았다.

실제 모델 확인은 단일 질문의 기능 점검이며 품질·부하 시험이 아니다. 사진은 인증된 입력 검증까지 확인했으며 실제 사진 모델 시연은 별도다. `/api/places`는 기존 FastAPI 미연결 경계가 남아 있어 지도 검색 완료를 의미하지 않는다. [이전 배포 기록](docs/deployment-2026-09-17.md)과 [조건 저장 구현 당시 검사](docs/condition-save-integration.md)는 당시 범위로 보존한다.

## 1. 기반 환경 실행

이 브랜치의 Spring은 **암호화 키 파일이 필수**다. 최초 실행/기존 DB 갱신 전 [사용자 사실 보호 저장](docs/private-facts-storage.md)의 키 준비·V8~V10 암호화 이관 및 V11/V12 적용 절차를 완료한다. 기본 실행은 이관을 자동 승인하지 않는다.

Docker Compose와 Python 3가 필요하다. 이후 웹 개발의 Node 기준은 `.nvmrc`의 24.14.1이다.

```bash
python3 scripts/setup-local.py
docker compose config --quiet
./start.sh
docker compose ps
```

`./start.sh`는 PostgreSQL 18.6·Elasticsearch 9.5.3/Nori와 앱 프로필의 Spring·Next를 빌드하고 실행한다. DB·ES만 필요하면 `docker compose up -d --wait`를 사용한다. 새 환경은 새 볼륨으로 시작하며 Spring이 재구성 DB 전체를 Flyway로 설치한다. 기존 QA의 개인 데이터는 복제하지 않는다. `.env`의 프로젝트명·포트로 기존 실행 환경과 분리한다.

| 서비스 | 기본 로컬 주소 | 현재 범위 |
|---|---|---|
| PostgreSQL | `127.0.0.1:55433` | DB `eco`, 사용자 `eco`, 비밀번호는 로컬 `.env` |
| Elasticsearch | `http://127.0.0.1:19201` | 사용자 `elastic`, Nori 설치, Basic 라이선스 |
| Kibana | `http://127.0.0.1:15602` | 선택 실행: `docker compose --profile tools up -d --wait` |
| Next | `http://127.0.0.1:3300` | 기존 화면, `/api/health`로 Spring·PG 연결 확인 |
| Spring | `http://127.0.0.1:18080/api/health` | Java21·Spring Boot4.1.1, 실제 DB `SELECT 1` |

현재 QA의 3000/8080/9200/55432 및 이전 팀 환경의 3200/19200/15601과 포트가 겹치지 않는다. 포트를 바꾸면 관련 URL도 함께 맞춘다. 일반 종료는 `./stop.sh`이며 볼륨은 보존된다. 기존 `uninstall.sh`는 옛 설치 파일 삭제 도구이므로 이 통합 환경의 종료에 사용하지 않는다.

## 팀 개발·QA 공유 주소

- 공유 주소: https://hospital-provinces-soap-metallic.trycloudflare.com
- 연결: Cloudflare 임시 터널 → QA 보호 프록시(`127.0.0.1:3001`) → 팀 Next(`127.0.0.1:3300`) → Spring·PG·ES·BGE.
- 사용자 이름은 `qa`, 비밀번호는 기존 공유 비밀번호다. 인증값·실제 API 키는 저장소에 기록하지 않는다.
- PC·Docker·프록시·터널이 실행 중이어야 한다. Git 푸시만으로 실행 앱이 갱신되지는 않는다. 현재 고정 릴리스의 재기동은 [배포 기록](docs/deployment-2026-09-18.md)을 따른다.
- 임시 터널 재시작 시 주소가 바뀐다. README·운영 상태와 카카오 JavaScript SDK 도메인 등록을 함께 갱신한다. 현재 새 주소의 도메인 등록은 사용자 확인 기준 완료다. 실제 사용하는 로컬 웹 주소도 별도 등록한다.

## 2. 공유받은 API 키 TXT 넣기

파일 형식은 `config/api-keys.example.txt`를 따른다. 전달받은 TXT를 `.local/api-keys.txt`에 두거나 저장소 밖 파일을 직접 지정한다.

```text
OPENAI_API_KEY=
KAKAO_REST_API_KEY=
NEXT_PUBLIC_KAKAO_MAP_KEY=
# 선택: 정부24 API를 사용하는 경우
GOV24_API_KEY=
```

```bash
python3 scripts/setup-local.py --api-keys .local/api-keys.txt
# 또는 --api-keys /path/to/shared-keys.txt
```

UTF-8 TXT(BOM/Windows 줄바꿈 포함), 빈 줄·주석·값 양옆 따옴표를 지원한다. 위 네 이름만 읽고 파일을 셸로 실행하지 않는다. 빈 값은 기존 키를 지우지 않는다. 잘못된 이름·중복·값 형식은 가져오기 전에 거부하며 값을 출력하지 않는다.

가져오기는 루트 `.env`와 `frontend/.env.local`에 입력한 키를 반영한다. 서버용 키는 웹 컨테이너 실행 시 전달하며 Docker 빌드 인자로 전달하지 않는다. JavaScript 지도 키만 `NEXT_PUBLIC_`로 웹 빌드에 전달해 브라우저에 공개한다. 실제 TXT·생성된 환경 파일·`.local/`은 Git 제외 대상이다. 외부 API 키 없이도 기반 환경을 실행할 수 있지만, Spring에는 위의 개인 사실 암호화 키 파일이 별도로 필요하다. 가져오기 후 `./start.sh`로 다시 빌드·생성한다. 특히 공개 지도 키는 빌드 시 고정되므로 컨테이너 재시작만으로 바뀌지 않는다.

## DB 검증본

[DB 스키마·매핑·재현 검사](database/README.md)의 검증본 전체를 Flyway V1/V2에 연결했고 회원 계정은 V3로 추가했다. `./scripts/setup-db.sh`로 PG·Spring만 기동하면 공개 자료와 회원 스키마까지 설치된다. [접속·설치 범위·확인](database/development.md). 회원·사용자 조건·catalog 조회 API는 구현했으며 공식 지역 참조와 나머지 업무 API는 후속이다.

## 회원가입·닉네임

[기존 세션 방식의 회원 관리](docs/member-accounts.md)를 팀 구조에 연결했다. `/signup`에서 닉네임을 선택 입력하고 비우면 `에코쭙`+랜덤6자리로 저장한다. `/profile`에서 확인한다. 로컬 팀 Spring에 V3를 적용했고 실제 가입·로그인·내 정보·개인화 조회를 확인했다. 2026-09-18 배포 후 보호 프록시를 통과한 실제 브라우저에서도 가입·로그아웃·재로그인을 확인했다.

## 3. 다음 단계

배포 기능의 사용자 QA와 실제 사진 시연을 진행한다. 모델 품질·성능 시험은 별도 진행 중인 작업과 구분한다. 지도 장소 검색의 외부 서버 연결은 남아 있으며, 실제 공유 주소에서의 카카오 화면 동작은 도메인 등록 후 사용자 QA로 확인한다.

공통 [Next→Spring API 클라이언트](docs/spring-client.md)와 [합의한 아키텍처](docs/architecture.md)를 따른다. Next는 AI·LangGraph·도구 실행을, Spring은 회원·업무 API·암호화·SQL/DB를 맡는다. [상담 종료 정책](docs/condition-save.md) · [개인 사실 보호 저장](docs/private-facts-storage.md).

[1단계 당시 검사](docs/environment-step1.md) · [2단계 당시 검사](docs/environment-step2.md) · [3단계 당시 검사](docs/environment-step3.md). 새 환경에는 API 키 외에 BGE 모델 캐시·ES 인덱스 준비가 필요하며 `run-ai.sh`는 기존 FastAPI용이다.
