# 프론트 통합 QA 배포 (2026-09-18)

프론트 `qa-frontend-align-20260918`에 홈/미션/챗 진입·로그인/가입/프로필/동네/지도 톤 정렬, 현재 지도/장소/동네 QA수정과 정책20개 설명을 통합해 배포했다. Spring은 `qa-map-20260918`, DB는 기존V13 그대로다. 사용자 “최신 변경 통합→검사→QA반영” 승인으로 실행했으며 이전 정책 보류 기록은 이 배포 전 상태다.

프런트 전체197/197·린트·빌드/타입, 대역브라우저29흐름/4너비 통과. 실제 QA보호프록시에서 가입·홈실제진행도·동네검색/명시저장/관심사이동·소유미션챗질문/복귀, 정책20개 카드/상세와 원문혜택보존/미대상fallback을 확인했다. 실제 지도검색40곳·성동구개인컵13곳·빈결과/모바일 통과. 다른4서비스 컨테이너ID/시작시각동일·5개healthy. 시험계정/기록·전용컨테이너 정리 완료. 실제 모델·사진·Kakao타일/경로 실기기 검사를 새로 수행한 것은 아니다.

고정 릴리스: `/mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align`.
통합 프론트 소스 커밋: 별도 저장소 `work/frontend-qa-integrated`의 `994e639`. 제품 main에는 소스 적용, 미커밋/push없음. 프론트185파일이 적용 직후 일치했고 빌드에 포함되는184파일(환경설정 예시 제외)도 이미지와 일치한다.

제품 루트에서 같은 통합 웹으로 재기동:

```sh
docker compose --project-directory "$PWD" --env-file .env -p eco-jupjup-team -f .local/releases/20260918-f54b22f/docker-compose.yml -f .local/releases/20260918-f54b22f/release.override.json -f .local/releases/20260918-map-connect/release.override.json -f /mnt/c/Users/Minju/projects/codex-harness-lab/.local/releases/20260918-frontend-align/release.override.json --profile app --profile ai up -d --no-build --no-deps --wait frontend
```

직전 웹으로만 원복할 때 마지막 frontend-align override를 빼고 같은 명령의 frontend만 실행한다. UI/정책20화면은 이전 상태로 돌아가며 Spring/DB이관은 유지된다.

배포 뒤 제품에서 별도 QA 작업의 `KakaoMap.tsx` 지도격리와 `ChatPanel.tsx` 새상담안내 수정이 발생했다. 그 변경은 덮어쓰지 않았다. **이번 고정이미지에는 두 후속 수정이 없으므로, 다음 배포는 이 통합본에 후속 변경을 합쳐야 한다. 이전 qa-map 화면 전체로 덮어쓰면 이번 UI/정책 통합이 사라진다.** 배포 직전 실행이미지/컨테이너를 다시 대조한다. 기존 로그인후원래미션복귀·상세정보정리 등 보류이슈는 별도다.

[실행·고정소스·검사·정리 근거](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-frontend-align-2026-09-18/integration/README.md).
