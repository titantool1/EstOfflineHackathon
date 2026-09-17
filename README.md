# 에코줍줍 팀 개발 환경

## 현재 상태

`feat/eco-chatbot`에 `frontend` 브랜치의 화면 구현(`3df14ab`)을 반영했다. 홈·온보딩·챗봇·미션·지도 화면이 있다. 챗봇은 고정 응답, 미션·장소는 샘플 목록, 미션 완료는 브라우저 컴포넌트 상태다. 실제 챗봇 API·인증·사용자별 저장·카탈로그 검색은 아직 연결되지 않았다.

현재 저장소의 Compose는 Elasticsearch·Kibana 개발 환경이다. 별도로 시험한 Next/LangGraph·Spring·PostgreSQL·BGE 앱의 이식은 후속 작업이다. 기존 QA 앱과 저장 데이터는 이 셋업에 복사하지 않는다.

## 준비 및 실행

Node.js 24.14.1(`.nvmrc`), npm, Python 3, Docker Compose가 필요하다.

```bash
python3 scripts/setup-local.py
npm ci --prefix frontend
# Elasticsearch + Kibana
docker compose up -d --wait
# 프론트 개발 서버 (별도 터미널)
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3200
```

- 웹: http://localhost:3200
- Elasticsearch: http://localhost:19200 (사용자 `elastic`, 비밀번호는 로컬 `.env`의 `ES_LOCAL_PASSWORD`)
- Kibana: http://localhost:15601 (`elastic`과 같은 비밀번호로 로그인)
- 기존 QA 앱의 3000/8080/9200/55432 포트와 분리한다. 새 ES 볼륨은 빈 개발용이며 기존 카탈로그·임베딩 인덱스가 자동 복제되지 않는다.

초기화 스크립트는 `.env`와 `frontend/.env.local`을 만들며 기존 파일은 보존한다. `.env.example`만 Git에 포함하고 실제 키·비밀번호·로컬 로그는 제외한다. 여러 복제본을 동시에 실행하려면 `.env`의 프로젝트명·컨테이너명·포트를 각각 바꾼다.

## 지도 설정

`frontend/.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_KEY`에 Kakao JavaScript 키를 넣고 해당 앱에 개발 주소를 등록한다. 이 값은 브라우저에 공개된다. 서버용 비밀키를 넣지 않는다. 키가 없으면 기존 화면의 키 설정 안내가 표시된다. 지도 실제 로드·DB 좌표 연결·사용자 위치 활용은 별도 확인 대상이다.

## 셋업 확인 및 종료

```bash
cd frontend
npm run lint
npm run build
cd ..
docker compose ps
# 개발 서버는 해당 터미널에서 Ctrl+C
# ES/Kibana 중지 (데이터 유지)
docker compose stop
```

`uninstall.sh`는 볼륨과 저장소 설정 파일까지 삭제하는 기존 제거 스크립트다. 일상적인 종료는 `docker compose stop`을 사용한다.

현재는 실행 환경 확인 단계다. 실제 모델 호출과 QA 품질 재시험은 별도 진행하며, 팀의 원본 frontend 브랜치는 이 작업에서 변경하지 않는다.

검증 결과와 남은 연결 범위: [셋업 확인](docs/setup-check-2026-09-16.md).

장소 API 시험은 [별도 시험 안내](docs/place-search-trial.md)를 따른다. REST API 키 설정 후 실제 호출은 카카오맵 서비스 비활성으로 HTTP403이었다. 카카오맵 사용 설정 ON 후 검색 시험을 재개한다.
