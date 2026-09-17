# 관심동네 검색 QA 수정 (2026-09-18)

현재 QA 웹 이미지는 `eco-jupjup-team-frontend:qa-neighborhood-20260918`이다. 기존 f54b22f 배포 위에 행정동 누락 주소의 좌표 보완 조회·후보 안내를 추가했다. 기존 미커밋 관심사 진입 링크를 포함한 5파일 수정이 제품 소스와 고정 릴리스에 있으며 아직 commit/push하지 않았다. 백엔드와 DB 포함 다른4서비스는 유지했다.

카카오 주소 결과에 행정동이 없으면 최대5개 주소 기준점의 행정동을 조회한다. 넓은 지역 전체 행정동 목록은 아니므로 일부후보 안내를 표시하고 직접 선택/저장하게 한다. 좌표·상세주소는 저장하지 않는다.

동네17검사·Dockerfile필수104검사·lint·build/타입 통과. QA 보호프록시 경유 실제카카오5검색·성수동2/봉천동1후보·명시선택저장·재조회 통과, 시험회원잔여0. 외부 사용자 기기의 원래검색어 재확인은 후속이다.

고정 릴리스: `.local/releases/20260918-neighborhood-fix/`. 재기동은 제품 루트에서 기존 배포 compose/override 뒤에 수정 override를 추가한다.

```sh
docker compose --project-directory "$PWD" --env-file .env -p eco-jupjup-team -f .local/releases/20260918-f54b22f/docker-compose.yml -f .local/releases/20260918-f54b22f/release.override.json -f .local/releases/20260918-neighborhood-fix/release.override.json --profile app --profile ai up -d --no-build --no-deps --wait frontend
```

이 수정만 원복하려면 마지막 neighborhood-fix override를 제외해 frontend만 이전f54b22f 이미지로 교체한다. 이번 변경에는 DB 이관이 없다. 기존 암호화 배포 전체의 원복 제약은 [기존 배포문서](deployment-2026-09-18.md)를 따른다.

[실행·수정본·원복 근거](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-user-qa-2026-09-18/neighborhood-fix/README.md).
