# 관심사 미설정 문구 QA

저장 관심사가 없으면 내프로필 링크는 ‘설정’, 선택 화면은 ‘관심사를 설정해볼까요?’와 첫 선택 안내를 표시한다. 저장값이 있으면 기존 수정 문구를 유지하며 초안 선택/해제로 제목이 바뀌지 않는다. 조회 실패를 빈값으로 취급하지 않고 저장/취소/로그인 복귀 경로는 유지한다.

최신 미션지도 QA 기반의 ProfilePreferences.tsx·InterestSelector.tsx 두 파일만 수정,246검사·린트·타입·빌드·대역5/실제회원4흐름 통과. 시험회원/컨테이너0. 웹qa-interest-copy-20260918만 교체했고 다른4서비스 ID 유지·5healthy다. DB/서버 변경없음. 별도 qa/interest-copy-20260918 커밋96d58b3에서 제품 작업본에 반영했으며 이 작업의 main commit/push는 없다.

형제 작업대 codex-harness-lab/evidence/eco-interest-copy-2026-09-18의 README·deployment-result.json·restart-command.json·release.override.json·rollback.override.json이 근거와 재기동/원복 기준이다. 고정 소스는 같은 작업대 .local/eco-interest-copy다. 이후 배포가 있으면 최신 구성을 우선한다.
