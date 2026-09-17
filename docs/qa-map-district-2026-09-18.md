# 실천지도 구 단위 검색·전체 초기화 QA 반영

2026-09-18 사용자 승인으로 홍대 등 지명을 기존 지역 파싱 모듈로 확인해 시도/구 조건으로 DB 검색하도록 연결했다. `홍대 텀블러`는 마포구의 개인컵 장소9곳, `홍대`는 마포구34곳을 반환했다. `전체 장소 보기`는 검색어·카테고리·전달 URL·상단 동네 선택을 지우고 기본40곳으로 돌아간다. 경로찾기는 제거 상태다.

현재 웹/백엔드 이미지는 각각 `eco-jupjup-team-frontend:qa-map-district-20260918`, `eco-jupjup-team-backend:qa-map-district-20260918`이다. 새063828f 프론트 통합판과 기존 행동명 검색을 유지한 후속 배포다. DB·ES·임베딩은 교체하지 않았다. 회원 데이터 수정/스키마 이관/커밋/push 없음. 백엔드 재시작으로 재로그인이 필요할 수 있다.

[전체 변경·검사·정리](../../codex-harness-lab/evidence/eco-map-district-search-2026-09-18/README.md), [배포/Compose 기반 명령](../../codex-harness-lab/evidence/eco-map-district-search-2026-09-18/deployment-result.json), [현재 이미지 override](../../codex-harness-lab/evidence/eco-map-district-search-2026-09-18/release.override.json), [직전 이미지 원복 override](../../codex-harness-lab/evidence/eco-map-district-search-2026-09-18/rollback.override.json).

재기동은 배포 결과의 해당 서비스 commands에 현재 override를 마지막으로 붙여 `up -d --no-build --no-deps --wait frontend backend`로 수행한다. 후속 배포로 실행 버전이 바뀌었다면 그대로 재실행하지 않고 최신 기준을 대조한다. 고정 소스는 작업대 `.local/releases/20260918-map-district-v2`다.

지도 모듈20파일의 제품/고정/빌드입력 해시가 일치한다. 제품의 다른 진행 중 프론트 소스는 보존했으므로 배포판 전체와 main이 동일하다는 뜻은 아니다. 이후 프론트 main 통합은 [최종 manifest](../../codex-harness-lab/evidence/eco-map-district-search-2026-09-18/manifest.json)의 지도 변경과 동네 선택기 연동을 유지한다.
