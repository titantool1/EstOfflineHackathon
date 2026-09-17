# 반응형 웹 보완 인계

## 기준·범위

`origin/main` 6ab7fe945d74f648e6766a4d3b2600b24a8b1362에서 분리한 `work/responsive-web`의 화면 변경이다. 사용자 정보 저장 담당 세션이 최신 통합본에서 최종 통합검증·배포한다. 이번 브랜치는 main 병합·push·배포를 수행하지 않았다.

## 변경

- `SiteHeader`: 홈·미션·상세·일반 지도·미션 장소·채팅 공통 메뉴. 모바일 메뉴 열기, 실제 링크 이동 후 닫기, Escape/포커스 이탈 닫기, 현재 위치 표시. 주 메뉴와 프로필에 44px 이상의 터치 높이.
- `ChatViewport`/`ChatPanel`: 동적 viewport와 VisualViewport 높이·위치에 맞춘 채팅. 대화만 내부 스크롤하고 입력은 하단에 유지. 추천 질문·주의문은 대화 스크롤 안으로 이동. 첫 안내는 위에서 표시, 새 응답은 아래로 스크롤. 16px textarea는 최대96px까지 늘어나며 이후 자체 스크롤. 데스크톱 Enter 전송, Shift+Enter 줄바꿈, IME 조합 Enter 전송 방지. 터치 환경 Enter는 줄바꿈, 보내기 버튼으로 전송. 안전영역 하단 여백.
- 미션·상세·관련 장소: 긴 영문 식별 문자열·제목·주소·출처 줄바꿈, 장소 상태 배지와 오류·빈 화면 버튼 감싸기.
- 일반 지도: 모바일/태블릿의 지도 높이와 선택 정보 분리. 선택 정보는 지도 아래 문서 흐름에 두고, PC는 지도 위 높이 제한/내부 스크롤. 검색 16px·카테고리 감싸기·장소명 전체 표시·외부 링크 터치 높이 확보.
- 출처: 터치 화면에 도메인 표시, 한 번 눌러 기존 새 탭 링크 열기. PC hover/focus 설명은 viewport 안에 배치하고 부모 스크롤 영역 밖 portal에 표시. Escape/스크롤/resize로 닫기. URL 필터와 noopener/noreferrer 유지.

## 검사 결과

- Next16.3.5 production build, ESLint, TypeScript 통과.
- 기존 미션/관심사 UI·상세 BFF·지도 오류·상담 세션31건, 채팅 기본/출처10건, 총41건 통과.
- Chromium Playwright: 320×568, 390×844 모바일; 768×1024 태블릿; 1440×900 PC. 홈·미션·상세·관련 장소·일반 지도·채팅을 모의 API와 긴 연속 문자열로 확인. 가로 넘침 없음. 모바일 메뉴 실제 이동, 출처 새탭/도메인, 긴 대화/다중줄 입력/IME, 오류·빈 결과·새 상담 복구 검사.
- 390×360/844×390과 VisualViewport 높이340·offset28 주입/복원에서 입력창·보내기 버튼 가시성 확인. 이는 실제 모바일 OS 키보드 검사가 아니다.
- backend/database/BFF/lib/클라이언트 계약/패키지196파일이 기준과 동일함을 바이트 비교. ChatPanel의 send/startNew/submit 본문도 동일. 미션 화면 탐색에서 accepted/completed 발생0을 모의 요청으로 확인.

검사 근거는 작업대 `codex-harness-lab/evidence/eco-responsive-web-2026-09-18/`의 README, browser-check.mjs, browser-production.log, build.log, lint.log, typecheck.log, tests.log, chat-source-tests.log, preserved-logic.json, 화면 PNG에 보존한다. 브라우저는 설치된 `eco-jupjup-prep/web/node_modules/playwright`를 재사용했다. 검사 서버만3357을 사용했고 실제 회원·운영 DB·모델·Kakao/GPS를 호출하지 않았다.

## 통합 담당 확인 사항

1. `ChatPanel.tsx`는 저장 담당의 상담 종료/새 상담/저장 상태 UI와 충돌할 수 있다. 저장 담당의 최신 이벤트·오류·저장 로직을 유지하며 이 브랜치의 레이아웃, history/composer ref, 키보드 처리를 합친다. 기존 startNew의 close 오류 처리 개선을 이번 변경으로 덮어쓰지 않는다.
2. 저장 상태 안내/재시도 UI가 추가된 최종 채팅에서 짧은 화면·키보드·다중줄 입력을 다시 확인한다. 실제 iOS Safari/Android Chrome의 키보드 열기/닫기·회전·IME·핀치 확대·안전영역은 실기기 확인이 남는다.
3. 실제 Kakao SDK·좌표·GPS·주소 링크 및 실제 회원/조건 저장을 합친 전체 동작은 통합 세션에서 확인한다. 이번 지도 캡처는 SDK 키가 없는 안내 화면과 모의 장소 자료다. Linux 검사 브라우저의 일부 이모지 글리프는 네모로 표시됐다.
4. 검사 실행기는 소스 의존성/브라우저 경로를 해당 환경에 맞춘다. `next start`로 로컬 production 화면 검사는 실행됐지만 standalone 경고가 있으므로 실제 배포는 기존 standalone Docker 경로를 따른다. 기존 동적 파일 추적 빌드 경고는 남는다.

Next 설치본에 AGENTS가 가리킨 dist/docs가 없어 [공식 viewport 문서](https://nextjs.org/docs/app/api-reference/functions/generate-viewport)와 [Link 문서](https://nextjs.org/docs/app/api-reference/components/link)를 확인했다. 화면 회전 시 SDK 자동 resize 설명은 [Kakao 공식 문서](https://apis.map.kakao.com/web/sample/mapRelayout/)를 참고했으며, SDK 실행 검증으로 간주하지 않았다.
