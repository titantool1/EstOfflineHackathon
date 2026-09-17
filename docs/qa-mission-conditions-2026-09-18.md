# 미션 조건 표시 최소 보완 QA

가전지원·그린리모델링·에너지바우처의 기존 DB 조건을 필수/중하나/제외/우대 묶음으로 표시한다. 확인한 조사 메모11개를 사용자 안내로 바꾸고, 같은 묶음의 반복 확인 안내는 한 번만 보여준다. 전체 문구 재작성·DB 구조/원자료·임베딩·추천·자격판정 변경은 없다. 다른 제도 조건 확대는 후순위다.

QA 웹은 `eco-jupjup-team-frontend:qa-mission-conditions-20260918`이다. signup-home 프론트 기반에 participation-info.ts·MissionInformation.tsx·participation-info.test.ts 세 파일만 더했다. 회원가입 홈 이동·매장검색·인증·기존 미션 상태를 보존했다. 전체245검사·린트·타입·빌드, 대역 브라우저6/실제QA5흐름 통과. 실제DB 조건3종과 시작/완료 후 새로고침 복원을 확인했다. 실제 모델은 호출하지 않았고 시험 회원/사용자0·전용 검사컨테이너0이다.

배포는 웹만 교체했고 다른4서비스 컨테이너 ID 유지·5healthy를 확인했다. 형제 작업대 `codex-harness-lab/evidence/eco-mission-condition-display-2026-09-18`의 README·deployment-result.json·restart-command.json·release.override.json·rollback.override.json이 당시 실행/재기동/원복 근거다. 이후 배포가 있으면 최신 구성을 우선한다. 고정 소스는 같은 작업대 `.local/eco-mission-condition-display`, 별도 브랜치 커밋dc4d28e다. 제품3파일에 문맥 패치로 반영했으며 이 작업의 main staging/commit/push는 없다.
