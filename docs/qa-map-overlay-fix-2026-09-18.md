# 지도 경로 카드 가림 수정 QA 배포 (2026-09-18)

현재 웹은 `eco-jupjup-team-frontend:qa-map-overlay-v2-20260918`이다. 최신 프론트 통합판을 보존하고 `frontend/src/app/map/KakaoMap.tsx`의 지도 루트에 `isolate` 한 클래스만 추가했다. 별도 새 상담 안내 수정은 소스에 보존·이 이미지에는 미포함이다.

필수106개·빌드/타입/지정 린트 통과. 실제 카카오 SDK를 로드한 PC 1280·모바일 390에서 카드 가림 해소, 장소 변경, 버튼 클릭 가능, 가로 넘침 없음을 확인했다. QA 배포 후 같은 검사 통과·프론트 healthy·다른4서비스 ID/시작 시각 동일. 실제 경로 계산과 외부 터널 전송은 검사 범위가 아니다. 소스 미커밋·push 없음.

고정 소스는 `.local/releases/20260918-map-overlay-v2/frontend`다. 초기 `.local/releases/20260918-map-overlay`는 동시 배포 발견으로 사용하지 않은 이전 기반이며 재기동에 쓰지 않는다.

## 현재 웹 재기동

```sh
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json --profile app --profile ai -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-overlay-v2/release.override.json up -d --no-build --no-deps --wait frontend
```

## 직전 통합 프론트로 원복

```sh
docker compose --project-directory /mnt/c/Users/Minju/projects/EstOfflineHackathon-env --env-file /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.env -p eco-jupjup-team -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/docker-compose.yml -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-f54b22f/release.override.json -f /mnt/c/Users/Minju/projects/EstOfflineHackathon-env/.local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json --profile app --profile ai up -d --no-build --no-deps --wait frontend
```

[패치·실행·화면·정리 근거](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-map-overlay-2026-09-18/README.md). 브라우저와 임시 검사 컨테이너·소스·초기 미사용 이미지를 정리했고 실행 이미지·릴리스·근거는 보존했다. 다음은 사용자 새로고침 후 QA다.
