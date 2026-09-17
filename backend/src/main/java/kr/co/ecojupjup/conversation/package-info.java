/**
 * 대화와 실행 이력 모듈의 구현 위치.
 *
 * <p>대화 소유권, 실행 상태, 중복 요청과 결과 저장을 담당한다. 자연어 흐름은 Next의 LangGraph 모듈에 둔다. DB 기록을 그래프의 일시 상태로 대체하지 않는다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.conversation;
