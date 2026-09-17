# 장소 자료 이관·미션 연결 QA 반영 (2026-09-18)

현재 Next/Spring 실행 이미지는 `eco-jupjup-team-frontend:qa-places-20260918`, `eco-jupjup-team-backend:qa-places-20260918`이며 Flyway V13 적용 완료다. main62b1695 위의 장소 변경과 기존 미커밋 동네검색/관심사 진입 링크·지도 제목 수정을 포함한 고정 소스를 검사했다. 이번 소스는 미커밋이며 commit/push는 하지 않았다. [자료·매핑 정책](place-mapping.md).

1,373곳을 추가해 기존9곳 포함 장소1,382행·연결1,382행이다. 새 연결은 텀블러241·리필320·고품질 재활용품 배출812이며 모두 실천 관련 후보/혜택 미확인이다. 원출처 이름과 원주소·좌표·후보 연결을 보존했다. 기존 추천 묶음도 현재 장소 수로 재조회한다.

확인: 실제 PG 포함 Spring99개(skip0), 프런트 필수106개·린트·프로덕션빌드/타입, 기존 회원·추천·실천기록 등 변경대상 외 테이블 해시 및 기존9장소·9연결·원출처 보존, 이관1373행 metadata 전수대조, 격리/배포 브라우저의 신규3행동·기존2행동·0건 경계/모바일/주소링크/복귀 통과. 추천 묶음은 합성 fixture로 만들었으며 자연 추천 순위·외부카카오 화면·모델답변 품질의 신규 검증은 아니다.

## 재기동·보존

제품 루트에서 실행한다. 앞선 동네검색 설정과 운영 키 연결을 유지한다.

```bash
docker compose --project-directory "$PWD" --env-file .env -p eco-jupjup-team -f .local/releases/20260918-f54b22f/docker-compose.yml -f .local/releases/20260918-f54b22f/release.override.json -f .local/releases/20260918-neighborhood-fix/release.override.json -f .local/releases/20260918-place-mapping/release.override.json --profile app --profile ai up -d --no-build --no-deps --wait backend frontend
```

고정 소스는 `.local/releases/20260918-place-mapping/source`이며 기존 암호화키는 변경하지 않았다. 변경 전 전체DB백업은 `/home/minju/.local/share/eco-jupjup/backups/20260918-place-mapping/before-v13.dump`에0600으로 보존했다. 아카이브 목록 판독을 확인했으며 이 백업의 전체 복원 재시험을 했다는 뜻은 아니다.

이전 프런트는 새 출처의 빈 URL을 받아들이지 못하므로 이전이미지 단독 복귀는 이 연결과 호환되지 않는다. 문제가 생기면 신규 사용자 쓰기를 보존하며 수정 배포하거나, 정지·백업을 포함한 원복 범위를 결정한다. 이번에 자동DB복원은 하지 않았다.

PG/ES/BGE 3서비스는 컨테이너ID·기동시각을 유지했다. prep은 중지 유지하며 전용 검사5컨테이너·2네트워크·Maven이미지·임시 키/경로는 정리했다. 현재/이전 실행이미지·고정소스·실행근거·비공개백업·공유빌드캐시는 보존한다.

일반 `/map` 검색 서버 연결·회원 동네 기준 정렬·장소별 최신 운영/포인트 지급 확인은 이번 미션 장소 매핑과 별개다. 작업대 근거: `/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-place-mapping-2026-09-18/README.md`.
