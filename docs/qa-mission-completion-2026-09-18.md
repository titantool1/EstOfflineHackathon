# 미션 완료 상태 유지 QA 배포 · 2026-09-18

웹/백엔드 `qa-mission-completion-final-20260918`. 최신063828f 화면과 지도 구 검색을 유지하고, 저장된 사용자별 실천 기록으로 완료 상태를 복원한다. 완료한 미션은 다시 시작 버튼 대신 완료 표시가 나오며 새로고침·새 묶음·재로그인에도 유지한다. 신규 스키마/데이터 이관은 없다.

프론트205·빌드/타입/린트 통과, 실제PG/인증5검사 skip0. 최종 backend 빌드는107개 중 환경의존10skip이며 전수DB검사 완료를 뜻하지 않는다. 격리 브라우저10흐름과 배포 QA 실제 완료/개수/새로고침/이벤트1건 확인, 시험계정잔여0. 다른3서비스ID 유지·5healthy·성동구텀블러13곳 보존. [근거](../../codex-harness-lab/evidence/eco-mission-completion-2026-09-18/README.md).

소스: 별도 `qa/mission-completion-20260918` 브랜치의 e8c10be. 제품 작업본의 수정11파일=배포본, main 커밋/push없음. 가입/로그인 정책은 이번 수정에서 변경하지 않았다.

## 재기동·원복

후속 배포 여부를 먼저 확인한다. 아래는 이번 배포의 고정 설정이다. 환경과 DB 볼륨을 유지하며 웹/백엔드만 재생성한다. 백엔드 교체 후 이전 로그인 세션은 재로그인이 필요할 수 있다.

```sh
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-action-search-2026-09-18/backend.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-district-search-2026-09-18/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-overlay-v2/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-063828f/release.override.json --profile app --profile ai -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-mission-completion-final/release.override.json up -d --no-build --no-deps --wait backend frontend
```

이전 지도 구 검색 배포로 원복:

```sh
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-action-search-2026-09-18/backend.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-district-search-2026-09-18/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-overlay-v2/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-063828f/release.override.json --profile app --profile ai -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-mission-completion-final/rollback.override.json up -d --no-build --no-deps --wait backend frontend
```
