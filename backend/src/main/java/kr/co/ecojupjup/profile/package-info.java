/**
 * 사용자 프로필과 관심사 모듈의 구현 위치.
 *
 * <p>관심사와 채택된 사용자 사실의 조회/정정을 담당한다. 모델의 추출 후보는 검증 후 저장한다. 실제 필드, 이력, 버전과 저장 포트는 DB 설계 후 정한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.profile;
