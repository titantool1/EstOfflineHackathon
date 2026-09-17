/**
 * 지역 해석과 장소 정보 모듈의 구현 위치.
 *
 * <p>확인된 지역과 장소 조회를 담당한다. 카카오 응답과 내부 지역/장소 모델을 구분한다. 지도 표시는 프론트 책임이며 지역 ID와 장소 관계는 자료 설계 후 정한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.places;
