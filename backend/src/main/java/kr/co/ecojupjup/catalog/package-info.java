/**
 * 제도, 행동과 근거 자료 모듈의 구현 위치.
 *
 * <p>검토된 자료의 상세 조회와 조건/출처, 지원하는 조건 비교 규칙을 담당한다.
 * 검색용 문서와 저장 원본을 구분한다. 조회 DTO와 비교 지원 범위는 저장소의 DB 검증본에 맞춰 정한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.catalog;
