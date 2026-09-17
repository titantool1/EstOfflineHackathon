# 재구성 DB로 개발하기

기준은 main `3b5fd2c`에서 검증한 전체 구성이다. 제도·행동·조건·출처·범주·장소 관계, 기본/상세 사용자8테이블, 참조표와 입력 매핑, 조회 함수3개를 팀 PostgreSQL의 `app` 스키마에 설치한다.

## 실행

저장소 루트에서 Docker Compose와 Python3로 실행한다. 호스트 PostgreSQL 설치는 필요 없다.

```sh
./scripts/setup-db.sh
```

이 명령은 기존 설정·비밀번호를 유지하고 PostgreSQL과 Spring만 빌드/기동한다. Spring의 Flyway가 V1(전체 스키마), V2(공개 자료·입력 매핑)를 적용한다. `./start.sh`로 전체 앱을 시작할 때도 같은 Flyway가 실행된다. 재실행은 적용 이력과 체크섬을 검증하며 데이터를 다시 적재하거나 볼륨을 지우지 않는다.

기본 접속은 `127.0.0.1:55433`, DB/사용자 `eco`, 비밀번호는 로컬 `.env`다. GUI나 SQL 도구에서는 `app` 스키마를 선택한다. Spring의 연결은 해당 search_path를 설정한다.

```sh
docker compose exec postgres psql -U eco -d eco
```

```sql
SET search_path TO app, public;
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
SELECT jsonb_pretty(benefit_lookup('scheme:G031', 'G031-A01'));
```

공개 자료는 제도·구별 후보69, 행동·후보106, 조건263, 출처106, 장소 예시9개다. 서비스5·수급유형7·기본 입력 연결45·상세 입력 연결59도 들어간다. 원문·미확인/폐지 상태·출처와 미연결 조건은 그대로 유지한다. 장소9개는 전체 장소 목록이 아니다.

## 사용자 정보와 이전 DB

사용자8테이블은 생성하지만 실제 QA 계정·대화·개인정보는 복사하지 않는다. `users(id uuid)`는 검증본의 사용자 식별자 참조 자리다. 로그인·세션 구현이나 실제 인증 서비스 연동 완료를 뜻하지 않는다. `regions`의 계층 구조는 생성하며 공식 지역 자료와 사용자값은 비워둔다. `test:` 지역과 시험 사용자도 자동 적재하지 않는다. 인증·공식 지역 연결은 다음 버전 마이그레이션에서 확장한다.

기존 QA `55432/eco`의 V1~V6는 **이전 DB 설계의 별도 이력**이다. 팀 개발 DB에 그 스키마를 섞거나 과거 마이그레이션 파일을 덮어쓰지 않는다. 이번 팀 이력은 V1/V2로 시작한다. QA 볼륨·데이터는 그대로 남는다. 기존 QA 주소로 팀 서버를 연결해 마이그레이션을 실행하지 않는다.

SQL 조회 결과는 여전히 `eligibility_status=not_evaluated`다. 데이터 셋업 완료와 실제 업무 API·전체 조건 판정·챗봇 연결 완료는 구분한다.

## 관련 확인과 변경 규칙

```sh
PYTHONDONTWRITEBYTECODE=1 python3 database/build_migrations.py --check
python3 scripts/check-db-setup.py
```

첫 명령은 동결한 마이그레이션이 검증 SQL·공개 자료로 재현되는지 파일만 비교한다. 두 번째는 실제 적재 수·사용자 테이블·대표 조회와 false/미선택 보존을 확인하며 합성 사용자는 트랜잭션으로 롤백한다. 기존240검사를 자동 재실행하지 않는다. 개발 중 카탈로그를 의도적으로 변경했다면 고정 적재 수 검사는 그 변경을 반영해 갱신한다.

V1/V2는 적용 후 수정하지 않는다. 정의·데이터 변경은 V3 이상을 추가한다. `build_migrations.py`도 기존 파일 내용이 달라지면 덮어쓰지 않고 중단한다. 원본 검증 SQL은 재현 근거로 보존하며 런타임이 읽는 파일은 `backend/src/main/resources/db/migration/`이다.
