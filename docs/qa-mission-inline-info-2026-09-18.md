# 미션 참여정보·시작 상태 QA 반영

같은 카드에서 참여 방법과 조건을 펼치고 접으며 출처는 별도 토글로 원문 링크를 제공한다. 선택 행동/공통 참여 전제를 구분하고 제도 전체 혜택 중복·내부 매핑을 제거했다. 수량·준비·참여 제한과 기존 시작→자기확인→완료 흐름, 장소·챗 연결은 유지한다.

QA 웹/서버는 `qa-mission-inline-v2-20260918`이다. 최신 chat-login 웹과 mission-draw 서버에 참여정보5파일 및 기존 시작 상태 복원 서버5파일을 합성했다. 동시 프론트 배포 후 acceptedMissions 응답 누락으로 발생한 progress503도 해소했다. 서버 교체 전 로그인 세션은 재로그인이 필요할 수 있다. DB 이관은 없으며 DB·ES·임베딩 컨테이너를 유지했고 다섯 서비스 healthy다.

웹 전체225검사·린트·타입·빌드, 서버111검사(환경의존14skip·실패0), 일회용 실제 PostgreSQL의 진행 기록/권한3검사(skip0), 최종 UI 대역10/실제QA6흐름을 통과했다. 실제 카드 토글·별도 출처·선택 행동만 표시·시작 후 새로고침·자기확인 미체크·완료 복원을 확인했다. 실제 모델은 호출하지 않았고 시험 계정 잔여0·임시 정리를 완료했다.

근거는 형제 작업대 `codex-harness-lab/evidence/eco-mission-inline-info-2026-09-18/README.md`, 고정 소스는 `.local/releases/20260918-mission-inline-v2`다. 재기동 인자는 근거 폴더의 `restart-command.json`, 적용 이미지는 `release.override.json`, 실제 전후는 `deployment-result.json`을 따른다. 이후 배포가 있으면 최신 실행 구성을 우선한다. `rollback.override.json`은 당시 progress 불일치가 있던 이전 쌍이므로 정상 복구 기준으로 사용하지 않는다.

토글 구현은 별도 qa/mission-inline-info-20260918의1bcfbfe에서 제품 작업본으로 반영했고 기존 시작 복원 서버 소스와 함께 최종 검사본 해시를 대조했다. 제품 main 커밋/push는 하지 않았다. 다음은 사용자 QA이며 가입 후 이동 플로우 결정은 별도다.
