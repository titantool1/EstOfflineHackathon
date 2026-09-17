# 팀 개발 DB 마이그레이션

main `3b5fd2c`의 재구성 전체 DB를 Flyway로 설치한다.

- V1: 제도·행동·조건·출처·장소 관계, 사용자 기본/상세8테이블, 참조표·입력 매핑 구조와 조회 함수.
- V2: 검증된 공개 자료·서비스·수급 유형·기본/상세 입력 매핑. 실제 사용자값은 없다.

Spring이 시작할 때 app 스키마에 적용·validate한다. 팀 이력은 기존 QA의 V1~V6와 다른 구성이다. 이전 QA DB에 연결하거나 이력을 복사하지 않는다. 적용된 SQL을 수정하지 말고 후속 버전을 추가한다.

[셋업·접속·검사·한계](../../../../../../database/development.md). 생성 근거는 database의 검증 SQL·JSON이며 `python3 database/build_migrations.py --check`로 동결본과 대조한다. 인증·공식 지역 참조와 실제 업무 API 연결은 후속이다.
