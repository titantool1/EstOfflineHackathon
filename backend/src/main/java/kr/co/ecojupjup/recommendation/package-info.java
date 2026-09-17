/**
 * 기본 미션 추천 모듈의 구현 위치.
 *
 * <p>사용자 문맥과 후보를 받아 제외, 정렬과 추천 이유를 계산한다. 기본 추천에 모델 호출을 요구하지 않는다. 점수 규칙은 순수 함수로 두고 입력/이력 조회는 응용 처리에서 조립한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.recommendation;
