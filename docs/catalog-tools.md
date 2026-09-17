# 챗봇 카탈로그 검색 도구

현재 챗봇 `/api/chat`의 `createConversationRuntime`에 공개 카탈로그 도구가 연결된다. Next는 SQL/ES를 직접 조회하지 않고 Spring API를 사용한다.

## 검색과 상세 조회

1. 모델이 `search_catalog(query, limit, offset)`를 선택한다. 자연어 검색어는 1~200자, limit 1~20, offset 0~1000이다.
2. Next가 검색어만 고정 BGE-M3 계약으로 임베딩한다. 일반 대화와 상세 조회에서는 BGE를 초기화하지 않는다.
3. Spring `POST /api/catalog/actions/search`에 `{query, embedding, limit, offset}`을 보낸다. 공통 클라이언트는 `/api/auth/csrf`에서 받은 토큰과 세션을 함께 전송한다.
4. Spring은 ES의 Nori 키워드와 벡터 순위를 RRF로 합친다. 페이지마다 같은 1021개 후보 창을 사용한다. 반환은 `query, match_mode=hybrid_rrf, offset, limit, has_more, items[]`이다.
5. 선택한 후보의 `program_key + action_id`로 `get_catalog_action`을 호출한다. Spring `GET /api/catalog/actions/detail`은 **현재 PostgreSQL**의 상세·조건·출처·연결 장소를 조회한다.
6. 기존 대화 도구의 선택 ID 검사와 사용자 조건 조회/메모리 처리를 유지한다. 검색 후보 자체는 이용 자격 판정이 아니다.

기존 `GET /api/catalog/actions` 문자 검색 API도 남아 있지만 챗봇 검색 도구는 위 POST 경로를 사용한다. API는 `{data,error,requestId}`와 `X-Request-Id`를 따른다. 검색 실패·부분 실패·BGE 장애를 검색 결과 0건으로 바꾸지 않는다. 정확한 `CATALOG_ACTION_NOT_FOUND`만 상세 없음으로 처리한다.

`catalog-tools.ts`의 팩토리는 `createCatalogTools(springClient, embedQuery)`다. `runtime.ts`가 두 의존성을 연결한다. BGE 주입 없는 팩토리는 상세 조회만 가능하며 검색 시 `EMBEDDING_NOT_CONFIGURED`를 반환한다. 도구 인수에 회원 ID나 벡터를 모델이 직접 넣지 않는다.

## 기존 자료 범위

인덱스 기본값은 `eco-team-catalog-actions-v1-20260917`이다. 기존 58개 행동의 검색 본문/벡터 쌍을 재사용한다. 문서 추가·재임베딩은 하지 않는다. 현재 DB 106개 행동 전체를 검색하는 것은 아니며 미포함 48개는 추가 작업 범위에서 제외했다.

모델은 `BAAI/bge-m3`, revision `5617a9f61b028005a4858fdac845db406aefb181`, 정규화 1024차원, 최대 길이 512다. 다섯 행동의 기존 검색 요약에는 최신 상세의 추가 문구가 없으므로 해당 문구의 검색 누락 가능성이 있다. 후보를 찾은 뒤에는 현재 DB 상세를 기준으로 답한다. 인덱스 조건 라벨은 후보 정보이며 회원 조건/관심사 관계의 원본이 아니다.

## 실행 연결

- Spring: `CATALOG_ELASTICSEARCH_URL`, `CATALOG_ELASTICSEARCH_INDEX`, `CATALOG_ELASTICSEARCH_USERNAME`, `CATALOG_ELASTICSEARCH_PASSWORD`.
- Next: `SPRING_BASE_URL`, `EMBEDDING_BASE_URL`, `AI_INTERNAL_TOKEN_FILE`. 서버 전용 설정이다.
- Compose의 BGE 서비스는 `ai` 프로필이다. `./start.sh`의 `app` 프로필만으로 BGE가 시작되지는 않는다. 배포 담당자는 검증된 모델 snapshot이 `bge-model-cache`에 있는지 먼저 확인하고 `docker compose --profile ai up -d --wait embedding`을 실행한 뒤 앱을 반영해야 한다. 캐시 준비가 모델 다운로드이고, 문서 임베딩 생성과는 별개다.
- 예전 BGE 서비스는 응답 metadata가 부족할 수 있다. 주소만 교체하지 말고 현재 `embedding-service`와 Next의 계약 일치를 확인한다.
- 새 환경의 ES에는 이 인덱스가 자동 생성되지 않는다. 기존 재사용 산출물의 범위·모델·ID를 확인하고 `scripts/catalog-search-index.py`의 `verify`로 점검한다. 이 통합은 인덱서를 자동 실행하지 않는다.

소스 통합과 운영 반영은 별개다. 공유 Next/Spring/BGE 서비스를 교체하지 않고 격리 환경에서 검사한다. 하이퍼링크·지도 표시·회원 조건 저장은 별도 작업이다.

## 검사

- backend Docker 빌드의 `mvn verify`: 기존 회원/조건/카탈로그 검사와 ES 순위·페이지·오류 계약.
- frontend: `npm run test:catalog`, `npm run test:server`, `npm run test:conversation`, `npm run test:ai`; 변경부 ESLint와 production build.
- 실제 연결: 격리 BGE/Spring에 Next 도구로 질의하여 기존 ES 후보와 현재 PG 상세 복합 ID 일치를 확인한다. OpenAI 호출과 추천 품질 전수 검증은 별도다.
