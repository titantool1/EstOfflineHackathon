# 미션 행동 표시·추천 순환 QA 배포 (2026-09-18)

현재 웹·Spring 이미지는 `qa-mission-draw-20260918`이다. 직전 완료 상태 복원 배포판을 기반으로 최신 프론트·지도 구 검색·완료 기록을 유지했다. DB 마이그레이션·기존 기록 변경은 없다.

제도 공통 제목으로 반복돼 보이던 다행동 제도7개의 행동44개를 행동별 제목·설명으로 카드/상세/홈/미션 챗에 연결했다. 사용자별 미추천 우선, 이후 오래된 추천 우선, 동순위 무작위로 뽑는다. 한 묶음의 제도+행동 고유성과 같은 요청 재시도 결과를 유지한다. 후보 소진 후에는 기존 행동이 다시 나올 수 있다. 추천 이력은 화면 열람이 아니라 발급한 묶음 기준이다.

알고리즘 v2를 사용하고 프론트는 저장된 v1도 읽는다. 완료 집계·조건·장소는 기존 제도+행동 기준이다. 다른 제도의 유사한 행동을 의미 기준으로 통합하지 않았다.

검사: 백엔드 빌드111/실패0/환경의존14skip, 별도 실제PG 추천4/skip0. 프론트 전체208·린트/타입/빌드 통과. 배포된 실제 API·PC/모바일9항목에서 연속 묶음 비중복, 행동별 표시, 장소 연결, 완료 재진입 유지 통과. 5서비스 healthy·다른3서비스 동일, 시험계정/컨테이너 정리. 브라우저 앱 요청은 localhost QA 보호프록시로 전달했고 외부 터널 자체는 미검사다.

## 현재 재기동

호환 프론트를 먼저 올린다.

```sh
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-action-search-2026-09-18/backend.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-district-search-2026-09-18/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-overlay-v2/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-063828f/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-mission-completion-final/release.override.json --profile app --profile ai -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-mission-repeat-qa-2026-09-18/fix/release.override.json up -d --no-build --no-deps --wait frontend
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-action-search-2026-09-18/backend.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-district-search-2026-09-18/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-overlay-v2/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-063828f/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-mission-completion-final/release.override.json --profile app --profile ai -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-mission-repeat-qa-2026-09-18/fix/release.override.json up -d --no-build --no-deps --wait backend
```

## 직전 완료 복원판으로 원복

```sh
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-action-search-2026-09-18/backend.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-district-search-2026-09-18/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-overlay-v2/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-063828f/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-mission-completion-final/release.override.json --profile app --profile ai -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-mission-repeat-qa-2026-09-18/fix/rollback.override.json up -d --no-build --no-deps --wait backend frontend
```

고정 소스: 작업대 `.local/releases/20260918-mission-draw`. [패치·검사·전후·정리 근거](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-mission-repeat-qa-2026-09-18/fix/README.md). 소스 미커밋·push 없음. 백엔드 교체로 이전 로그인 세션은 재로그인이 필요할 수 있다. 다음은 사용자 새로고침 후 QA다.
