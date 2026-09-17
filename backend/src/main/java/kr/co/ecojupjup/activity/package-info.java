/**
 * 추천 노출, 조회와 실천 기록 모듈의 구현 위치.
 *
 * <p>노출/상세 조회/자기보고 실천을 구분해 기록한다. 인증된 사용자와 중복 사건을 확인한다. 사건 키와 집계/저장 구조는 DB 설계 후 정한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.activity;
