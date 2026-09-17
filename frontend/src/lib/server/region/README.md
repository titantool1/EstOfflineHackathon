# 지역 확인 모듈

출처: codex-harness-lab/modules/eco-region (2026-09-18 복사). 기존 지역 파싱 시험의 index/resolution/validation/kakao 모듈과 타입을 수정 없이 재사용한다. 시험 사본 자체의 설치/승인 상태는 변경하지 않는다.

실천지도 연결은 ../map/search-region.ts가 담당한다. 원문 지명 추출 → API 후보 선택 → 이 모듈의 지도 근거 확인 → sido/sigungu DB 조건 전달이다. 모호함/실패를 임의 지역으로 대체하지 않는다. 관심동네 저장·거리/반경 계산은 수행하지 않는다.
