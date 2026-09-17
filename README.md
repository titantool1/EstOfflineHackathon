# 에코줍줍 통합 개발 환경

우리 사전 실험의 Next.js·Spring·PostgreSQL·ES/Nori·LangGraph·BGE-M3 구성을 팀 개발의 기준으로 준비한다. 현재 완료 범위는 **1단계: 저장소·검색 기반 환경과 API 키 입력 자리**다. 웹·Spring·AI 실행 골격과 기능 API는 다음 단계다.

main에 있던 프론트·FastAPI 검색 코드는 그대로 보존했다. 이 단계의 Compose가 그 코드를 실행하거나 검색 인덱스/실험 데이터를 이식하는 것은 아니다. 기존 FastAPI의 인덱스·필드 계약은 다음 단계에서 새 구조와 맞춘다. `run-ai.sh`는 기존 코드용이므로 아직 통합 환경 실행 명령으로 사용하지 않는다.

## 1. 기반 환경 실행

Docker Compose와 Python 3가 필요하다. 이후 웹 개발의 Node 기준은 `.nvmrc`의 24.14.1이다.

```bash
python3 scripts/setup-local.py
docker compose config --quiet
./start.sh
docker compose ps
```

기본 실행은 PostgreSQL 18.6과 Elasticsearch 9.5.3/Nori다. 새 환경은 빈 DB·검색 볼륨으로 시작하며 기존 QA/팀 DB를 복제하지 않는다. `.env`의 프로젝트명·포트로 기존 실행 환경과 분리한다.

| 서비스 | 기본 로컬 주소 | 현재 범위 |
|---|---|---|
| PostgreSQL | `127.0.0.1:55433` | DB `eco`, 사용자 `eco`, 비밀번호는 로컬 `.env` |
| Elasticsearch | `http://127.0.0.1:19201` | 사용자 `elastic`, Nori 설치, Basic 라이선스 |
| Kibana | `http://127.0.0.1:15602` | 선택 실행: `docker compose --profile tools up -d --wait` |
| Next / Spring | `3300` / `18080` | 다음 단계용 예약, 아직 Compose에 없음 |

현재 QA의 3000/8080/9200/55432 및 이전 팀 환경의 3200/19200/15601과 포트가 겹치지 않는다. 포트를 바꾸면 관련 URL도 함께 맞춘다. 일반 종료는 `./stop.sh`이며 볼륨은 보존된다. 기존 `uninstall.sh`는 옛 설치 파일 삭제 도구이므로 이 통합 환경의 종료에 사용하지 않는다.

## 2. 공유받은 API 키 TXT 넣기

파일 형식은 `config/api-keys.example.txt`를 따른다. 전달받은 TXT를 `.local/api-keys.txt`에 두거나 저장소 밖 파일을 직접 지정한다.

```text
OPENAI_API_KEY=
KAKAO_REST_API_KEY=
NEXT_PUBLIC_KAKAO_MAP_KEY=
```

```bash
python3 scripts/setup-local.py --api-keys .local/api-keys.txt
# 또는 --api-keys /path/to/shared-keys.txt
```

UTF-8 TXT(BOM/Windows 줄바꿈 포함), 빈 줄·주석·값 양옆 따옴표를 지원한다. 알려진 세 이름만 읽고 파일을 셸로 실행하지 않는다. 빈 값은 기존 키를 지우지 않는다. 잘못된 이름·중복·값 형식은 가져오기 전에 거부하며 값을 출력하지 않는다.

서버용 키는 루트 `.env`와 Next 서버용 `frontend/.env.local`에 저장한다. JavaScript 지도 키만 `NEXT_PUBLIC_`로 브라우저에 공개된다. 실제 TXT·생성된 환경 파일·`.local/`은 Git 제외 대상이다. 키가 없어도 이번 PG·ES 환경은 실행된다. 가져오기 후 이미 실행 중인 앱은 다음 단계의 앱 재시작 절차로 반영한다.

## 3. 다음 단계

1. 웹 → Spring → PG 상태 확인과 공통 API 골격.
2. 서버 전용 LangGraph·모델·BGE 임베딩 실행과 도구 경계.
3. 사용자·카탈로그·추천·대화·장소·실천 기록 모듈 자리.
4. 전체 기동·키 전달·기존 화면 보존 확인 후 main 통합.

기본 추천은 코드, 자연어 해석·질문·답변은 AI 흐름에 둔다. 이번 단계에서는 실제 모델 호출·카탈로그 적재·개별 기능 구현을 하지 않는다.

[1단계 실제 검사와 확인 한계](docs/environment-step1.md).
