/**
 * 대화와 실행 이력 모듈의 구현 위치.
 *
 * <p>대화 소유권, 보존하기로 정한 결과와 중복 방지 기록을 담당한다.
 * 현재 그래프 노드, 도구 실패 분기와 모델 호출 상태는 Next의 LangGraph 실행부에 둔다.
 * 저장할 항목과 수명은 실제 DB 연결 때 정한다.
 *
 * <p>현재는 패키지 위치와 책임만 정의한다. 실제 기능을 추가할 때 필요한
 * api/application/domain/adapter 하위 패키지를 만든다.
 * 모듈 경계와 의존 방향은 docs/architecture.md를 따른다.
 */
package kr.co.ecojupjup.conversation;
