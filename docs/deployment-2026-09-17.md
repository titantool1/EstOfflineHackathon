# 팀 main 공유 배포 (2026-09-17)

현재 배포 코드: **`51e1fafab00083f73a63717ac7b2e97ef34bc576`**. `1812fdd`의 BGE/ES 검색과 챗봇 출처 링크를 합쳐 main에 푸시했고 동일 커밋을 Spring·Next·BGE 이미지 label과 대조했다. 이전 운영0ca38f5에서 전환했다.

공유 주소: https://hook-gen-meyer-evident.trycloudflare.com

기존 터널→QA 보호 프록시3001→팀 Next3300→Spring18080/PG·ES·BGE 경로다. 기존 QA 인증/서명쿠키와 터널PID·주소를 유지했다. 관심동네 화면/API와 DELETE /api/chat 전달 규칙4개를 함께 반영했다.

## 확인 결과

- 고정 합성본 Spring45·프론트111 검사, lint·타입·production build 통과.
- Spring/Next/BGE healthy, 이미지 커밋 일치. PG/ES 이미지·기동 시각 유지. 기존DB 비공개 백업 후 V5 관심동네 적용; Flyway V1/V2/V3/V5.
- BGE 현재 서비스 코드와 고정32의존성 일치. 기존 pinned snapshot을 읽기 전용으로 재사용. ES `eco-team-catalog-actions-v1-20260917` 문서58·벡터58/ID·조건·검색본문 대조 통과. 추가 문서 임베딩/색인쓰기 없음.
- localhost QA 보호 경로 브라우저: 8화면, 가입/로그아웃/재로그인, 실제 카카오 동네 검색·저장·새로고침 유지, 실제 OpenAI 답변, 링크 hover/focus/Escape/원문 새탭, 새 상담 종료 확인. pageerror0. 시험회원 잔여0.
- 실제 `텀블러 사용 혜택 찾아줘` 응답200, 약8.8초(단일표본). 혜택/조건/공식 출처4개 포함. 이는 품질 전수/부하 시험이 아니다.
- 로그인 실패5회 뒤429/Retry-After60 확인. 공개 비인증401, localhost HTTPS전달 조건의 QA/앱 Secure·HttpOnly, 비공개경로404 확인. QA 비밀번호를 외부로 보내는 공개 인증 브라우저 시험은 하지 않았다.

## 기능 경계

미션은 현재 예시 카드이며 실제 출처 필드가 전달될 때만 출처링크를 표시한다. 별도 미션추천/회원관심사 작업은 이번에 병합하지 않았다. 장소검색 `/api/places`는 기존 FastAPI 미연결503이며 지도 검색까지 완료한 배포가 아니다. 링크만 처리하며 일반 Markdown 강조 표시는 이번 범위 밖이다. 회원조건 영구저장→새상담 재사용 전체 시연은 별도 검증으로 남는다. 실제 답변의 앱 대화 종료200은 확인했지만 외부 Responses/Conversation 개별 삭제는 독립 조회하지 않았다.

V4 관심사 매핑은 미포함이다. 이후 통합자는 이미 V5가 적용된 운영DB에서 V4 순서를 다뤄야 하며, 미적용을 적용 완료로 간주하지 않는다.

## 반복 배포와 원복

고정 소스/운영 override: `.local/releases/20260917-51e1faf`. 기본 compose의 빈 신규 BGE volume 대신 기존 모델 캐시 bind를 사용하는 이 override를 유지한다. 코드/설정을 바꿔 재빌드할 때는 새 커밋·검사·새 릴리스 경로를 만들고 이번 기록을 덮어쓰지 않는다. 푸시만으로 서비스가 배포되지 않는다.

현재 고정 버전 재기동(저장소 루트):

```bash
docker compose --project-directory "$PWD" --env-file .env -p eco-jupjup-team -f .local/releases/20260917-51e1faf/docker-compose.yml -f .local/releases/20260917-51e1faf/release.override.json --profile app --profile ai up -d --no-build --no-deps --wait embedding backend frontend
```

원복용 앱 이미지는 `eco-jupjup-team-frontend:before-51e1faf`, `eco-jupjup-team-backend:before-51e1faf`이고 해당 릴리스의 `rollback.override.json`에 지정했다. 현재 명령에 이 override를 마지막으로 추가해 frontend/backend만 전환한다. 프록시는 `private-before/proxy.cjs`(3300대상)와 상태기록을 사용한다. V5는 열 추가이며 앱 원복에 DB 전체복원을 자동 수행하지 않는다. 필요시 사용할 `private-before/postgres.dump`는 읽을 수 있는 archive임을 확인했으며 실제 복원 시험은 하지 않았다. 비밀설정 백업도 같은 비공개 폴더에 보존했다.

[실행·이미지·브라우저·정리 근거](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-main-release-2026-09-17/README.md).
