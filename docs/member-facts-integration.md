# 회원 사실·미션 통합검증

2026-09-18, `work/member-facts-integration`에서 main `6ab7fe9`와 조건 저장 `4622cf7`(암호화 `8734a38` 포함)을 충돌 없이 병합했다. 추가 변경은 V7→V10 보존 회귀 테스트와 이 문서/실행 안내다.

## 검사 결과

- Spring: `mvn -B -ntp clean verify`, 85개 통과, 실패·오류·skip 0. Java 21/Maven 3.9, PostgreSQL 18.6의 외부 포트 없는 전용 DB를 사용했다.
- 실제 PG 검사 3개: 8계열 사실 이관·격리·원자적 변경, 실제 Spring Java V9 발견·트랜잭션, V7 회원·관심사·추천·활동 행과 V4 매핑의 V10 이관 보존. 이관 전후 조건/동네 조회도 대조했다.
- 프론트: Node 24.14.1, 전체 143개 통과, skip 0. `npm run lint`, `npm run build`, `npx tsc --noEmit` 통과.
- 실제 Next→Spring→DB: 새 DB에 V1~V10 적용 후 가입·로그인, 암호화 동네 쓰기/읽기, 관심사 저장, 추천과 재요청, 활동 기록과 재요청, 다른 회원의 동네/추천/활동 격리를 확인했다. CSRF 누락·타 Origin 요청 거절과 주요 페이지 HTTP 응답까지 총 30개 점검을 통과했다.
- 독립 코드 검토: 미션/관심사 보존과 Spring 저장 빈 연결에 통합 차단 문제 없음.

시험은 합성 사용자·키만 사용했다. 최초 시험 서버는 internal 네트워크에서 포트가 게시되지 않아 연결할 수 없었고, DB는 내부망에 유지한 채 웹/Spring만 별도 검사망에 연결한 뒤 localhost 검사에 성공했다. 제품 수정으로 해결한 문제가 아니다.

## 확인 한계와 다음 작업

[조건 저장 1단위](condition-save.md)는 아직 production 저장 어댑터·Spring HTTP API·상담 종료 화면에 연결되지 않았다. 이번 통합검증은 실제 상담 조건 저장 완료를 뜻하지 않는다. 다음은 인증된 owner로 조건을 FactChange에 매핑하고 충돌/중복 요청 결과를 처리하는 Spring 저장 경계를 연결하는 한 단위다. 대화별 메모리를 유지한다.

외부 모델/카카오 API, 브라우저 상호작용, 운영 DB 복사본 이관·키 복구·배포는 이번 검증 범위에 포함하지 않았다. 실행 서버 검사는 빌드 산출물의 Next standalone/실행 jar 기준이며 배포 이미지·Compose 최종 구성 검사는 배포 단계에서 한다. 배포 전에는 [암호화 유지보수 이관](private-facts-storage.md)을 적용해야 한다.

원시 로그·테스트 보고서·실행 스크립트·검사본 SHA256·독립 검토는 작업대 `evidence/eco-member-facts-integration-2026-09-18/`에 보존한다.
