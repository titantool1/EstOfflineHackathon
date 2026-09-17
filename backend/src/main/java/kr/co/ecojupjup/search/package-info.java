/**
 * 자료 검색과 결과 후보 모듈의 구현 위치.
 *
 * <p>정형 필터와 키워드/벡터 검색을 조립한다. PG/ES 접근과 외부 필드를 어댑터에 둔다. 인덱스 필드, 지역 범위와 후보 ID 계약은 데이터 설계 후 정한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.search;
