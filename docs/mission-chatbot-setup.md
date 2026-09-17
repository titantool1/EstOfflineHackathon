# 챗봇·에코미션 통합 브랜치 설치

대상 브랜치: `codex/mission-chatbot-integration`

## 준비물

- Git
- Docker Desktop 및 Docker Compose
- Python 3
- Node.js 24.14.1 (`.nvmrc` 기준)과 npm

## 새로 받기

```bash
git clone --branch codex/mission-chatbot-integration --single-branch \
  https://github.com/titantool1/EstOfflineHackathon.git
cd EstOfflineHackathon
python3 scripts/setup-local.py
npm ci --prefix frontend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

공유 API 키 TXT가 있으면 값을 출력하거나 Git에 넣지 말고 다음처럼 가져온다.

```bash
python3 scripts/setup-local.py --api-keys /absolute/path/to/api-keys.txt
```

## 챗봇·로그인·미션을 `localhost:3000`에서 실행

터미널 1에서 PostgreSQL, Spring, Elasticsearch를 실행한다.

```bash
cd EstOfflineHackathon
./scripts/setup-db.sh
docker compose up -d --wait elasticsearch
```

터미널 2에서 기존 FastAPI 검색 서버를 실행한다. 생성된 `frontend/.env.local`의 기본 주소와 맞추기 위해 18000 포트를 사용한다.

```bash
cd EstOfflineHackathon
.venv/bin/python scripts/restore-search-index.py \
  --input search-data/eco-jupjup-vector-v2.full.jsonl.gz
AI_SERVER_PORT=18000 ./run-ai.sh
```

처음 한 번만 검색 인덱스를 복원한다. 이미 `eco-jupjup-vector-v2` 인덱스가 있으면 복원 명령은 기존 데이터를 보호하기 위해 중단되므로 생략한다.

터미널 3에서 Next 개발 서버를 실행한다.

```bash
cd EstOfflineHackathon/frontend
npm run dev
```

접속 주소:

- 홈: `http://localhost:3000`
- 챗봇: `http://localhost:3000/chat`
- 회원가입: `http://localhost:3000/signup`
- 관심사 선택: `http://localhost:3000/onboarding`
- 미션 추천: `http://localhost:3000/missions`
- 미션 통계: `http://localhost:3000/missions/insights`

개발 중에는 `localhost`와 `127.0.0.1`을 섞지 않는다. 브라우저 저장소도 서로 다른 출처로 취급된다.

## 검색 데이터

`search-data/eco-jupjup-vector-v2.full.jsonl.gz`에 정책·행동·장소 17,850건, 384차원 임베딩과 관심사 매핑이 포함돼 있다. 위 복원 명령을 실행하면 모델로 전체 데이터를 다시 임베딩하지 않고 챗봇 검색과 관심사 추천을 시작할 수 있다. 자세한 검증값과 교체 방법은 `search-data/README.md`를 따른다.

## 전체 통합 Compose 방식

최신 `main` 기반의 PostgreSQL·Spring·Next·Elasticsearch 전체 컨테이너는 다음 명령으로 실행한다.

```bash
python3 scripts/setup-local.py
./start.sh
docker compose ps
```

이 방식의 웹 주소는 `http://127.0.0.1:3300`이다. 현재 기존 FastAPI 검색 서버는 통합 Compose 서비스에 포함되지 않았으므로, 챗봇까지 함께 시연할 때는 위의 `localhost:3000` 개발 방식을 사용한다.

## 기존 저장소에서 받기

작업 내용이 없다면:

```bash
git fetch origin
git switch --track origin/codex/mission-chatbot-integration
npm ci --prefix frontend
```

이미 같은 브랜치를 받은 뒤 갱신할 때:

```bash
git switch codex/mission-chatbot-integration
git pull --ff-only
npm ci --prefix frontend
```

개인 작업이 남아 있으면 먼저 커밋하거나 안전하게 보관한 뒤 브랜치를 전환한다.

## 확인과 종료

```bash
cd frontend
npm run lint
npm run build
```

`next dev`와 `next build`는 같은 `.next` 디렉터리를 사용하므로 동시에 실행하지 않는다. 프론트와 AI 서버는 실행한 터미널에서 `Ctrl+C`로 종료하고, Docker 서비스는 저장 데이터를 유지한 채 다음처럼 중지한다.

```bash
cd EstOfflineHackathon
./stop.sh
```
