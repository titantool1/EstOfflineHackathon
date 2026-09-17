# 3단계: 서버 전용 AI·임베딩 실행 골격

## 현재 범위

Next 서버 안에 LangGraph 검색→답변 실행 모듈과 OpenAI Responses 어댑터를 둔다. BGE-M3는 내부 HTTP 서버로 분리한다. 기존 실험에서 사용한 LangGraph1.4.15·core1.2.11·OpenAI SDK7.15.0과 BGE 고정 스냅샷을 기준으로 삼았다. 기존 `/api/chat`·챗 UI·FastAPI는 변경하지 않는다.

실행 그래프는 `질의 임베딩 → 주입된 검색 도구 → 근거가 있으면 모델 답변 / 없으면 자료 없음 안내`다. 빈 검색 결과와 실패를 구분하고, 검색 실패나 취소 뒤 모델을 호출하지 않는다. 이는 자연어 검색 흐름의 최소 골격이며 가입 정보 기반 기본 추천이나 모든 대화에 강제로 적용하는 알고리즘이 아니다. 조건 정형화·대화 메모리·사용자 소유권·실제 검색 API는 아직 연결하지 않았다.

## 파일과 책임

| 위치 | 책임 |
|---|---|
| `frontend/src/lib/server/ai/contracts.ts` | 임베딩·검색·답변 포트와 안전한 오류 코드 |
| `graph.ts` | LangGraph 흐름·분기·입력 확인 |
| `model.ts` | OpenAI 호출,45초 제한·자동 재시도0·store=false |
| `embedding.ts` | 내부 HTTP 호출·모델/버전/차원/정규화 검사 |
| `runtime.ts` | 환경 설정으로 어댑터 조립. 검색 도구는 호출자가 제공 |
| `frontend/src/app/api/ai/health/route.ts` | 임베딩 연결과 모델 키 설정 여부만 조회 |
| `embedding-service/contract.py` | 입력 한도·모델 계약 |
| `encoder.py` | 고정 모델을 오프라인으로 읽고 CPU 추론 |
| `server.py` | 내부 토큰 인증·HTTP·동시 추론1건 제한 |
| `download.py` | 최초 모델 파일 다운로드 |

서버 모듈은 `server-only`로 브라우저 import를 막는다. 코드 import는 상대경로 또는 저장소의 `@/` 별칭이다. Compose의 소스·키 파일 경로도 프로젝트 루트 기준 상대경로다. 팀원 개인 PC의 절대경로를 제품 설정에 넣지 않는다.

## 팀원에게 전달할 파일

각자 로컬 DB를 띄우는 기본 구성은 Git main과 별도로 전달받은 `.local/api-keys.txt`면 시작할 수 있다. TXT 형식은 `config/api-keys.example.txt`를 따른다. 실제 값을 예시 파일에 넣지 않는다. 정부24 키는 선택 항목이며 이번 코드에서 호출하지 않는다.

```bash
# 저장소 루트에서 실행
python3 scripts/setup-local.py --api-keys .local/api-keys.txt
./start.sh
```

DB·ES·Kibana 비밀번호와 내부 AI 인증 토큰은 각 환경에서 생성한다. `.env`, `frontend/.env.local`, `.local/`은 Git 제외다. 사용자 API 키가 없어도 기본 앱과 DB 상태 확인은 동작한다. 다른 PC의 생성된 `.env`나 내부 토큰을 복사할 필요는 없다. 공용 원격 DB를 사용한다면 그때 별도 접속정보를 전달한다. DB 스키마·초기 데이터 전달은 현재 별도 재구성 작업과 맞춘다.

## BGE 최초 준비와 실행

Docker·Python3가 필요하다. 모델 파일은 Git 대신 Docker의 `bge-model-cache` 볼륨에 저장한다. 최초 다운로드에는 네트워크와 수 GB의 저장 공간이 필요하다.

```bash
python3 scripts/setup-local.py
# 최초1회 또는 모델 캐시를 지운 경우
# setup-ai 프로필은 다운로드 서비스만 명시적으로 실행한다.
docker compose --profile setup-ai run --rm --build embedding-download
# 다운로드된 파일을 읽기 전용으로 마운트해 추론 서버를 시작한다.
docker compose --profile app --profile ai up -d --build --wait
curl http://127.0.0.1:3300/api/ai/health
```

일반 `./start.sh`는 기본 앱만 실행한다. BGE가 필요할 때 ai 프로필을 명시한다. `./stop.sh`는 앱·AI·Kibana를 멈추고 볼륨은 보존한다. 모델이 없으면 BGE 시작을 실패시켜 다운로드 필요성을 알리며 실행 중 자동 다운로드하지 않는다.

BGE는 호스트에 포트를 공개하지 않고 컨테이너 네트워크의 `http://embedding:8090`을 사용한다. 로컬 셸에서 웹을 직접 개발하는 경우 임베딩 서버 접근 경로를 별도 맞춰야 한다. `.env.local`의18090은 그때 사용할 설정 예시이며 기본 Compose가 그 포트를 여는 것은 아니다.

고정 계약: `BAAI/bge-m3`, revision `5617a9f61b028005a4858fdac845db406aefb181`, dense1024, L2 정규화, 최대512토큰. 질의는1~2개·각2000자 이하다. 동시 추론은1건이며 처리 중 새 요청은503으로 반환한다. 임베딩 문서 적재도 같은 계약을 사용해야 한다. 이번에는 ES 인덱스나 문서 벡터를 만들지 않는다.

## 상태 조회 의미

`GET /api/ai/health`는 모델을 호출하거나 과금하지 않는다. 응답의 `embedding`은 실제 내부 서버 상태, `model`은 `NOT_CONFIGURED` 또는 `CONFIGURED_UNVERIFIED`, `search`는 현재 `NOT_CONNECTED`다. 임베딩이 정상이면200, 연결이 없으면503이다. 키가 있다는 사실을 실제 모델 호출 성공으로 표시하지 않는다. 기본 `/api/health`는 AI와 독립적으로 Spring·PG만 확인한다.

이 단계에는 외부 모델을 호출하는 새 공개 API가 없다. 실제 검색 도구·인증을 연결한 서버 코드에서 `createAiRuntime(searchTool)`을 호출해야 답변 흐름을 사용할 수 있다. 모델은 제공된 자료로 답하도록 지시하지만 의미적 정확성은 이후 실제 자료·질의로 별도 평가해야 한다. 영속 대화 메모리를 이번 그래프의 일시 상태로 대체하지 않는다.

## 검사

2026-09-17: LangGraph/모의 SDK8검사·설정4검사·Python HTTP4검사와 웹 린트/빌드가 통과했다. 실제 BGE를 TypeScript 클라이언트로 호출해1024차원·정규화(norm≈1)를 확인했다. 내부 토큰 없는 요청401, 웹의 AI 상태 구분, 임베딩 중단503과 기본 앱 정상200도 확인했다. 기존 서비스는 동일하고 검사 컨테이너·볼륨·네트워크 잔여는0이다.

```bash
python3 -m unittest discover -s tests -v
(cd embedding-service && python3 -m unittest discover -s tests -v)
(cd frontend && npm ci && npm run test:ai)
```

Node 기준은 루트 `.nvmrc`의24.14.1이다. 프론트 Docker 빌드에도 실제 LangGraph·모의 OpenAI SDK 검사8개, 새 서버 코드 린트와 전체 웹 빌드가 포함된다. 설정 검사4개·Python HTTP 검사4개는 키/토큰 보존과 인증·입력 거부를 확인한다.

검사 결과와 실제 실행 기록은 하네스랩 `evidence/eco-team-environment-2026-09-17/`에 남긴다. 실제 BGE 검사는 기존 고정 모델 캐시를 읽기 전용으로 마운트한 격리 프로젝트에서 수행한다. 새 다운로드 전체 전송이나 외부 OpenAI 응답 품질을 검증한 것으로 보지 않는다. 모델 캐시·빌드 이미지와 Git 제외 로컬 로그는 개발에 재사용하며 검사 컨테이너·임시 볼륨·네트워크는 정리한다.

참고: [LangGraph 사용자 지정 흐름](https://docs.langchain.com/oss/javascript/langchain/multi-agent/custom-workflow), [BGE-M3 모델 계약](https://huggingface.co/BAAI/bge-m3). 기존 실험 파일은 참고 근거이며 사용자 데이터·기존 비밀키는 새 저장소에 복사하지 않는다.
