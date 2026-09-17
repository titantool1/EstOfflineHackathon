# 팀 main 통합 배포 (2026-09-18)

실행 코드: **`f54b22f825b6a7ab16f261b5d600bc97ff25e3e9`**. 조건 저장 `0bdcc16`과 main `e13c40a`를 합친 고정본을 검사하고 main에 병합·푸시했다. 이후 문서 커밋은 실행 이미지 변경이 아니다.

공유 주소: https://hospital-provinces-soap-metallic.trycloudflare.com

기존 주소 `https://hook-gen-meyer-evident.trycloudflare.com`의 프록시·터널 프로세스는 호스트 재시작 후 없었으며 DNS 조회도 실패했다. 새 Cloudflare 임시 터널을 같은 QA 보호·비밀번호로 연결했다. 대상은 QA 프록시3001 → 팀 Next3300이다. 사용자가 새 카카오 도메인 등록 완료를 알려 주었다. 이는 콘솔 설정의 사용자 확인이며 실제 외부 지도 조작 검사는 아니다.

## 배포 내용과 확인

- Spring·Next 이미지 revision=f54b22f, 팀 5개 서비스 healthy. PostgreSQL·ES·BGE 컨테이너 ID/기동 시각 유지. 중지된 prep 환경은 재시작하지 않았다.
- Spring 전체 clean verify 98개, 실패/오류/skip 0. 프런트 189개, 전체 lint·기본 production build·TypeScript 통과. 이미지 빌드의 DB skip과 별도 전체 PG 실행 결과를 구분한다.
- 운영 DB 백업을 격리 DB에 복원하고 별도 키 백업으로 V4/V6~V12 이관, 원래 키로 정상 재기동·API10 확인. 운영에서는 앱 쓰기를 중지한 뒤 최종 DB 백업을 추가 생성하고 같은 이관을 적용했다. 기존 V5보다 낮은 V4는 이관 기동에서만 out-of-order를 허용했다.
- 적용 이력: baseline, V1,V2,V3,V5,V4,V6,V7,V8,V9,V10,V11,V12. 기존 8개 사실 테이블 행 수와 나머지 기존 app 테이블 해시 보존 확인. 당시 운영 회원·개인 사실은 0건이므로 실제 회원이 채워진 운영 이관 증거로 확대하지 않는다. 유효한 사실을 넣은 시나리오는 별도 PG 검사에서 확인했다.
- 정상 재기동에서는 PRIVATE_FACTS_MIGRATION_ENABLED=false이며 SPRING_FLYWAY_OUT_OF_ORDER를 제거했다. 암호화 키는 DB·이미지·Git 밖에서 backend만 읽도록 연결했다.
- 보호 프록시 경유 실제 브라우저: 8화면200, 가입·동네 암호화 저장/조회·관심사 저장·미션 추천/상세/완료/진행도, 사진 입력 검증400, 실제 모델 스트리밍·타이핑 PATCH·새 상담 DELETE·로그아웃/재로그인 통과. pageerror0, 합성 회원 잔여0.
- 실모델 질문 “텀블러 사용 혜택 찾아줘”: 응답200, 8.83초, 진행 이벤트 6개·답변 조각 171개. 같은 질문을 검사 재시도 과정에서 3회 요청했고, 위 수치는 마지막 관측 완료 실행이다. 성능·품질 전수 보장이 아니다.
- 외부 비인증 `/`, `/api/health`, `/signup` 모두401. localhost HTTPS 전달 조건에서 QA/앱 Secure·HttpOnly, 비공개 경로404 확인. QA 비밀번호는 localhost에만 사용했고 외부 인증 완료 브라우저 검사는 하지 않았다.

첫 브라우저 검사는 채팅의 스트리밍 reader 종료 후 CDP가 본문을 반환하지 못해 15개 검사 뒤 실패했다. 실제 fetch 응답 clone 관측을 추가한 첫 재시도는 컴포넌트가 초기 생성 때 fetch를 보관한 뒤 관측기를 설치해 타임아웃됐다. 관측기를 페이지 초기화 전에 설치한 마지막 실행에서 채팅·로그인 경계를 통과했다. 요청/응답과 제품 코드는 바꾸지 않았으며 실패 기록도 보존했다.

## 반복 기동·키·백업

저장소 루트의 고정 릴리스 `.local/releases/20260918-f54b22f`를 사용한다. 이 override는 운영 키 파일과 기존 BGE 캐시를 지정한다. 일반 기본 compose로 바꿔 기존 키 연결을 잃지 않도록 한다.

```bash
docker compose --project-directory "$PWD" --env-file .env -p eco-jupjup-team -f .local/releases/20260918-f54b22f/docker-compose.yml -f .local/releases/20260918-f54b22f/release.override.json --profile app --profile ai up -d --no-build --no-deps --wait backend frontend
```

- 운영 키: `/home/minju/.local/share/eco-jupjup/security/private-facts-keyring.json`.
- 별도 키 백업: `/home/minju/.local/share/eco-jupjup/key-backups/20260918-f54b22f/private-facts-keyring.json`. 두 파일은 같은 값임을 비교하고 backend UID999 읽기 ACL을 제한적으로 부여했다. 파일을 새로 생성하거나 기존 키를 덮어쓰지 않는다.
- DB/설정 비공개 백업: 릴리스의 `private-before/`. 격리 복원에 사용한 `rehearsal-source.dump`와 앱 쓰기 중지 뒤 최종 `postgres-before-migration.dump`를 구분한다. 최종 백업은 archive 읽기를 확인했고 실제 복원 시험은 사전 백업으로 수행했다.
- 새 공유 프로세스·주소·로그는 기존 prep 저장소 `.local/app-qa/` 상태 파일에 기록한다. 해당 호스트 프로세스만 사용하며 중지된 prep 앱 컨테이너를 실행하지 않는다.

구 앱은 암호화된 V10 이후 스키마와 호환되지 않는다. **구 이미지 단독 원복은 금지한다.** 문제가 있으면 앱 쓰기를 먼저 중지하고 신규 쓰기 보존 여부를 확인한 뒤 수정 배포하거나 검증한 DB 백업과 이전 이미지(`before-f54b22f`)를 함께 복원한다. 자동 DB 덮어쓰기는 하지 않았다. [암호화 유지보수](private-facts-storage.md).

## 남은 확인

모델 품질·성능은 별도 작업이다. 이번 사진 검사는 입력 오류 경계까지이며 실제 촬영 사진 판정·보상 처리를 증명하지 않는다. 지도 장소 검색 `/api/places`의 기존 FastAPI 연결은 별도다. 새 도메인의 실제 카카오 지도 표시와 사용자 동선은 사용자 QA에서 확인한다. 90초 자동 종료는 [연결 검사](condition-save-integration.md)의 실제 90.26초 결과이며 이번 배포 브라우저에서 90초를 다시 기다리는 시험은 반복하지 않았다.

[배포 전체 실행 근거](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-condition-release-2026-09-18/README.md).
