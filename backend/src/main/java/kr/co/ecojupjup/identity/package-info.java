/**
 * 인증과 요청 사용자 식별 모듈의 구현 위치.
 *
 * <p>세션 검증과 인증된 사용자 전달을 담당한다. 사용자 ID 형식과 세션 저장 방식은 DB/인증 설계 때 정한다. 요청 본문의 사용자 ID를 신뢰하지 않는다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.identity;
