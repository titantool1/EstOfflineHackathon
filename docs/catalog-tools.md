# 공개 카탈로그 조회 도구

현재 팀 DB의 공개 제도·행동을 Spring HTTP API를 통해 조회한다. Next가 SQL을 직접 실행하지 않는다. 사용자 DB/조건 메모리·자격 판정과 별도이며 회원 식별값을 입력받지 않는다.

## HTTP 계약

공통 응답 `{data,error,requestId}`와 `X-Request-Id`를 따른다.

- `GET /api/catalog/actions?query=기후행동&limit=10&offset=0`: 제도·행동 후보 목록. 검색어는 공백으로 구분한 핵심어 1~8개, 전체 200자 이하다. 모든 단어가 관련 텍스트에 문자 그대로 포함되는 후보를 찾는다. limit 1~20, offset 0~1000. 기본값10/0. `%`·`_`·따옴표는 SQL 검색 연산자로 해석하지 않는다.
- `GET /api/catalog/actions/detail?programKey=scheme:G002&actionId=G002-A01`: 정확한 복합 ID로 행동 상세 조회. 한 프로그램의 ID로 다른 프로그램의 행동을 가져오지 않는다.

검색 대상은 프로그램 제목·대상·혜택, 행동 ID, 행동에 연결된 조건의 분류·요건·상세·적용 대상과 카탈로그 구다. URL·출처 상태 문자열 자체로 매칭하지 않는다. 순서는 program_key/action_id로 고정되며 관련성/거리/추천 순위가 아니다. `has_more`로 다음 페이지 존재를 알린다. 전체 카탈로그가 작다는 현재 전제의 PG 문자 검색이며 ES·벡터·동의어 검색은 포함하지 않는다. 자연어 문장을 그대로 넘기면 조사/표현 차이 때문에0건일 수 있으므로 도구 설명에 핵심어 입력을 명시했다. 카탈로그 구는 이용자 거주 요건이 아니다.

검색 응답: `query, match_mode=all_keywords_literal, offset, limit, has_more, items[]`. 후보에는 `program_key,action_id,title,identity_basis,program_status,catalog_district,condition_labels`가 있다. 프로그램 공통 설명 때문에 여러 행동이 후보가 될 수 있으며 행동 상세로 실제 적용 범위를 확인한다.

상세 응답은 기존 `benefit_lookup`의 조건·출처·공통 조건 그룹·장소를 보존한다. 여기에 `program` 개요와 `overview_sources`, `eligibility_status=not_evaluated`를 추가한다. 프로그램 개요를 행동별 보상/조건으로 자동 확대하지 않는다. `closed`·`unknown`, 날짜·스케줄·미확인·출처 확인 수준을 바꾸지 않는다. 장소는 등록된 연결 예시이며 최신 운영·전체 장소 목록을 보증하지 않는다.

## Next 도구 호출

`src/lib/server/ai/tools/catalog-tools.ts`는 서버 전용 팩토리, 함수 정의, 인수 검사와 실행을 제공한다.

```ts
import { createCatalogTools } from "@/lib/server/ai/tools/catalog-tools";

const catalog = createCatalogTools(); // SPRING_BASE_URL 또는 http://127.0.0.1:18080
const result = await catalog.execute("search_catalog", {
  query: "기후행동", limit: 10, offset: 0,
}, { requestId: "catalog-example", signal: AbortSignal.timeout(5000) });

// 반환된 후보의 복합 ID를 선택한 뒤 호출한다.
const detail = await catalog.execute("get_catalog_action", {
  programKey: "scheme:G002", actionId: "G002-A01",
});
```

도구 이름은 `search_catalog`, `get_catalog_action`이다. `catalog.definitions`는 모델에 제공할 function 스키마이고 `execute`는 허용된 두 이름만 실행한다. 취소 신호·요청 ID를 공통 Spring 클라이언트에 전달하며 인자/응답/복합 ID를 확인한다. 필요한 경우 `createCatalogTools(createSpringClient(...))`로 서버 설정과 검사 transport를 주입한다.

- 정상 검색0건: `status=no_results`, 등록자료 없음 안내. offset>0의 빈 페이지는 추가 자료 없음으로 한정한다.
- 없는 복합 ID: HTTP404 `CATALOG_ACTION_NOT_FOUND`를 `status=not_found`로 변환한다.
- 나머지 잘못된 요청·DB/HTTP 장애·잘못된 응답은 `CatalogToolError(code,status,requestId)`다.0건으로 바꾸거나 자동 재시도하지 않는다.

`createAiRuntime`의 임시 `SearchTool(query,vector)`와는 다른 업무 도구다. 기존 `/api/chat`의 FastAPI 경로와 모델→도구 대화 루프에는 아직 등록하지 않았다. 이후 A의 도구 선택을 연결할 때 이 팩토리를 사용한다. 실제 모델의 검색어 선택·대화 수락/정정·개인화는 이번 구현의 완료 범위가 아니다.

## 확인

- Java: backend의 `mvn verify`에 catalog API8검사와 기존 health4검사 포함.
- Next: frontend에서 `node --conditions=react-server --experimental-strip-types --test tests/catalog-tools.test.ts tests/spring-client.test.ts`.
- 타입: `npx next typegen` 후 `npx tsc --noEmit --incremental false`.
- 실제 팀 DB를 읽기 전용으로 연결한 격리 Spring 서버에 Next 도구로 요청했다. 검색·페이지·복수 검색어·0건·없는/교차 ID·잘못된 입력, 행동 상세5건의 기존 SQL 결과와의 일치를 확인했다. 실제 모델 호출·DB 쓰기는 없다.

새 API를 실행 환경에 쓰려면 Spring을 이 소스로 빌드·교체해야 한다. 소스 반영과 실행 서비스 반영을 구분한다. 이번 작업은 소스 구현·검사이며 기존 실행 서비스·QA를 교체하지 않았다.
