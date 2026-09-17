# 정책별 짧은 설명: 20개 QA 반영

후속 통합 승인으로 웹 `qa-frontend-align-20260918`에20개설명을 반영했다. 실제QA에서20개카드/상세설명·원문혜택보존·미대상fallback확인. [현재배포·근거](qa-frontend-align-2026-09-18.md). 아래는 준비 당시 보류 기록으로 보존한다.

## 준비 당시 기록

2026-09-18 사용자 지시: 먼저10개를 작성한 뒤 화면 반영은 나중으로 미루고10개를 추가한다.

표시용 설명의 원본은 `frontend/src/features/missions/program-summaries.ts`다. 카탈로그의 `program_key`로 조회하며 DB원문·금액·조건·추천순위는 변경하지 않는다. 등록69항목(일반28+지역사업41) 중 관심사연결정책27개가 있고, 그중20개에 두문장요약을 작성했다. 없는 키는 null로 기존 안내를 사용한다.

첫10개 단계에서 미션카드/상세상단의 ‘한눈에 보기’ 소스 초안을 작성·검사했으나 **QA에는 배포하지 않았다.** 추가10개는 데이터만 작성했다. 제품의 세 파일은 미커밋이며 사용자의 추후 화면 반영 요청 전 배포하지 않는다. 현재 실행웹은 지도QA판이다.

[전체20문안](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-policy-summaries-2026-09-18/summaries.md), [작업·검사·보류기록](/mnt/c/Users/Minju/projects/codex-harness-lab/evidence/eco-policy-summaries-2026-09-18/README.md).

제품 `.local/releases/20260918-policy-summaries/`는 첫10개 당시의 **미배포 보존본**이며 현재20개판이 아니다. 그때의 미사용 이미지는 정리했다. 나중에 반영할 때 최신제품변경과20개데이터로 새빌드·검사한다.
