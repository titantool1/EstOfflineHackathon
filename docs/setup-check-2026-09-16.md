# 개발 환경 확인 — 2026-09-16

- 입력: main c814909 기반 feat/eco-chatbot에 frontend 3df14ab을 fast-forward 반영.
- Node 24.14.1 / npm 11.11.0 / lockfile 기준 npm ci 완료. Next 16.3.5, React 19.2.8.
- 초기화 스크립트 2회 이상 실행 및 파일 해시 대조: 기존 환경 파일 보존. 실제 env와 .local은 Git 제외.
- Compose 설정 검사 통과. 별도 ES 9.5.3/Kibana가 healthy. ES 비인증401·인증200·cluster green, Kibana 로그인 페이지200.
- 최초 빌드의 Next 설정 로드 중 SWC 경로 오류는 재실행에서 재현되지 않았다. 이어 지도 컴포넌트의 nullable ref 타입 오류가 확인돼 effect 안에서 검증한 map 참조를 캡처하도록 수정했다.
- 수정 후 lint와 프로덕션 빌드(타입 검사 포함) 통과. 5개 화면의 HTTP200·기대 본문 확인: /, /chat, /missions, /map, /onboarding.
- 기존 QA 웹3000·백엔드8080 정상 응답 확인. 해당 서비스와 기존 DB/검색/임베딩 컨테이너는 변경하지 않았다.

## 유지한 실행 환경과 확인 한계

웹 개발 서버3200, ES19200, Kibana15601을 유지한다. 로컬 의존성·빌드 결과·새 Docker 볼륨·비밀번호도 다음 작업을 위해 보존한다. 모델 호출·QA 품질 시험·DB 카탈로그 복제는 하지 않았다. 카카오 키는 미설정으로 안내 화면까지만 확인했으며 지도 타일·마커 실제 동작은 미검증이다. 브라우저 상호작용·UI 시각 검사는 이번 HTTP 확인과 구분한다.

로컬 실행 근거는 `.local/setup/`의 build-final.log, lint-final.log, services.json, pages.json, checks.json이다. 첫 실패 로그도 같은 폴더에 남겼다. 개발 서버 PID·명령은 frontend-state.json에 있고 실행 로그는 frontend.log에 있다. 직접 서버를 종료하려면 해당 PID의 명령을 대조한 뒤 종료한다. ES/Kibana는 저장소에서 `docker compose stop`으로 중지한다.

다음: 기존 실험 앱의 실제 챗봇·DB를 이식할 파일 범위와 팀 화면의 API 연결 계약을 정한다. 미션·지도·QA 보완 분석은 별도 작업 결과를 합친다.
