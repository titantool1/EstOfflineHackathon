# 에코줍줍 통합 개발 환경

우리 사전 실험의 Next.js·Spring·PostgreSQL·ES/Nori·LangGraph·BGE-M3 구성을 팀 개발의 기준으로 준비한다. 현재 범위는 **실행 환경·기능별 모듈·화면 API 진입점 뼈대**까지다. 실제 검색 도구·인증·업무 API와 기존 챗 화면 연결은 후속 단계다.

main에 있던 프론트·FastAPI 검색 코드는 그대로 보존했다. 웹 화면은 Compose로 실행한다. 기존 FastAPI 검색 서버·검색 인덱스·실험 데이터는 아직 연결하거나 이식하지 않았다. 기존 FastAPI의 인덱스·필드 계약은 다음 단계에서 새 구조와 맞춘다. `run-ai.sh`는 기존 코드용이므로 아직 통합 환경 실행 명령으로 사용하지 않는다.

## 1. 기반 환경 실행

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

팀원들이 구현 중인 반응형 웹을 함께 확인하고 QA할 때 아래 임시 주소를 사용한다. 이후 구현 변경도 이 공유 환경에 반영해 확인한다.

- 공유 주소: https://hook-gen-meyer-evident.trycloudflare.com
- 현재 연결(2026-09-17): 공유 터널 → QA 보호 프록시(3001) → 기존 앱(3000).
- 전환 예정: 터널과 QA 비밀번호 보호를 유지하고 프록시 대상을 이 저장소의 팀 웹(`http://127.0.0.1:3300`)으로 변경한다. **3300 전환은 아직 적용하지 않았다.**
- 전환 후 새 앱을 갱신해도 터널이 유지되면 같은 주소로 확인할 수 있다. Git 푸시만으로 실행 중인 앱이 자동 갱신되는 구성은 아니다.
- 임시 터널을 다시 만들면 주소가 바뀔 수 있다. 바뀐 주소는 이 문서와 카카오 JavaScript SDK 도메인 등록에 함께 반영한다.

카카오 지도용 JavaScript SDK 도메인에는 위 공유 주소와 실제 사용하는 로컬 웹 주소(예: `http://127.0.0.1:3300`, `http://localhost:3300`)를 등록한다. QA 접속 비밀번호와 실제 API 키는 저장소에 기록하지 않는다.

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

가져오기는 루트 `.env`와 `frontend/.env.local`에 입력한 키를 반영한다. 서버용 키는 웹 컨테이너 실행 시 전달하며 Docker 빌드 인자로 전달하지 않는다. JavaScript 지도 키만 `NEXT_PUBLIC_`로 웹 빌드에 전달해 브라우저에 공개한다. 실제 TXT·생성된 환경 파일·`.local/`은 Git 제외 대상이다. 키 없이도 기반 환경·웹·Spring 상태 조회는 실행된다. 가져오기 후 `./start.sh`로 다시 빌드·생성한다. 특히 공개 지도 키는 빌드 시 고정되므로 컨테이너 재시작만으로 바뀌지 않는다.

## DB 검증본

[DB 스키마·매핑·재현 검사](database/README.md)를 추가했다. 제도·조건 조회와 사용자 정보8테이블을 격리 PostgreSQL에서 검사하는 코드이며, 검증본 전체의 Flyway V1/V2를 연결했다. `./scripts/setup-db.sh`로 PG·Spring만 기동하면 공개 자료까지 설치된다. [접속·설치 범위·확인](database/development.md). 실제 인증·공식 지역 참조·업무 API 연결은 후속이다.

## 3. 다음 단계

공통 [Next→Spring API 클라이언트](docs/spring-client.md)를 health에 연결했다. 업무별 호출 함수는 같은 연결부에 경로·입력·성공 데이터 검사만 추가한다. 현재 실제 업무 API·미션/지도 도구는 연결하지 않았다.

기능을 채우기 전 [합의한 아키텍처의 코드 틀](docs/architecture.md)을 정리한다. Next AI 실행부는 application/도구 계약/adapters와 runtime 조립으로 나누고, Spring은 기존 기능 패키지·health 참조 구조를 유지한다. 재구성 DB 전체는 Flyway로 설치하며 실제 업무 조회 API·새 챗 연결은 아직이다.

1. 완료 범위 확인: 웹 → Spring → PG 상태 조회와 공통 응답·오류·요청 ID. 실제 기능 API와 인증은 아직 없음.
2. LangGraph·모델·BGE 실행 골격 준비. AI를 켜려면 아래3단계 문서대로 모델 다운로드 후 ai 프로필 실행.
3. [기능별 모듈 뼈대와 책임 경계](docs/architecture.md), [화면 API 연결 자리](docs/api-skeleton.md) 준비. DB 설계·조회/저장 계약은 별도 작업 결과와 맞춘다.
4. 각 단계의 검증이 끝나면 main에 반영하고, 이후 단계에서 전체 기동·키 전달·기존 화면 보존을 확인.

기본 추천은 코드, 자연어 해석·질문·답변은 AI 흐름에 둔다. 현재 상태 검사는 외부 모델 API를 호출하지 않는다. 카탈로그 적재·실제 검색 도구·개별 기능 구현은 후속이다. `package-info.java`와 features 안내는 구현 위치 표시이며 기능 완료가 아니다. Flyway는 재구성 DB의 V1/V2를 적용한다.

[1단계 실제 검사와 확인 한계](docs/environment-step1.md) · [2단계 구조·API 계약·검사](docs/environment-step2.md) · [3단계 AI 실행·키 전달·검사](docs/environment-step3.md).
