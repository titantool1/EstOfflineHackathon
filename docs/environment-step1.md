# 통합 환경 1단계 확인 — 2026-09-17

기준 main `fa58622`에서 기반 환경만 준비했다. 기존 프론트·FastAPI 기능 소스는 변경하지 않았다. 통합 환경 기본값은 기존 실험의 PostgreSQL18.6, ES9.5.3/Nori, BGE-M3와 현재 채팅 모델 설정을 따른다. BGE·모델 실행은 아직 다음 단계다.

## 수행한 검사

- 로컬 설정 검사3개: 초기화 재실행/사용자 설정 보존, BOM·CRLF·따옴표 TXT 가져오기/빈 값 보존/값 미출력, 잘못된 이름·중복·셸 표현 거부와 기존 두 파일 보존.
- 기본 Compose와 선택 `tools` 프로필의 설정 검사, 셸 문법, Git 공백 검사 통과.
- 별도 Compose 프로젝트의 PostgreSQL·ES/Nori·Kibana 실제 기동·healthy 확인.
- ES 비인증401, Nori 플러그인 설치, `친환경 텀블러` 분석 결과 `친 / 환경 / 텀블러`, Basic 라이선스 확인.
- Kibana 로그인 페이지200 확인. 실제 UI 상호작용 검사는 하지 않았다.
- 검사용 PG에 데이터를 쓴 뒤 해당 컨테이너만 재생성하고 데이터 보존을 확인했다.
- 검사 컨테이너·볼륨·네트워크 잔여0. 기존 QA 및 이전 팀 서비스7개의 ID·시작 시각·상태가 전후 동일했다.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
python3 scripts/setup-local.py
docker compose config --quiet
docker compose --profile tools config --quiet
```

검사에서는 개발 기본 포트 대신35433/29201/25602를 사용했다. 기존 DB·ES 자료를 복제하지 않았고 외부 모델·지도 API 호출과 계정 생성은0회다. `.env`, `frontend/.env.local`, `.local/api-keys.txt`가 Git에서 제외되는 것을 확인했다. 검사 로그와 로컬 설정은 작업자의 `.local/`·개인 작업 기록에 보존하며 저장소에 올리지 않는다.

## 현재 한계와 다음 작업

이번 커밋은 저장소·검색 기반과 키 입력 자리다. Next·Spring·LangGraph·임베딩의 앱 기동, 카탈로그 적재, 챗·미션·지도 기능 연결은 아직 통합 확인하지 않았다. 다음 단계는 웹 → Spring → PG의 상태 확인과 공통 API 골격이며, 전체 확인 후 main에 합친다.
