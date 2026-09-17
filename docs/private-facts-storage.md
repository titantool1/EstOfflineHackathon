# 사용자 사실 보호 저장

`work/private-facts`는 기존 회원 사실 8개 테이블을 유지하면서 개인값을 Spring에서 AES-256-GCM으로 암호화한다. 사용자·가구·구성원·주택·차량 UUID와 구조 관계, 행 수는 DB에 남는다. 계정 이메일·닉네임·비밀번호 해시는 이번 변경 범위 밖이다. 운영에 적용하기 전 유지보수 이관과 키 준비가 필요하다.

## 조건 저장 담당 접점

`profile.facts`는 기존 소비자를 위한 공유 저장 계약(types/port)이며 JDBC 구현은 포함하지 않는다. `profile.facts.PrivateFactsStore`는 Spring 내부 포트다. 새로운 모델 도구나 직접 호출 가능한 HTTP API가 아니다. owner는 인증 세션으로 확정한 UUID만 전달한다. 요청 body/모델의 사용자 ID를 여기에 전달하면 안 된다.

- `list(owner, table)`, `find(owner, key)`로 현재 행과 revision을 받는다. 선택 가구의 `listMembers`, `listWelfare`는 SQL에서 owner/대상을 먼저 제한한다.
- `applyChanges(owner, changes)`는 한 트랜잭션에서 profile anchor를 잠그고 모든 부분 변경을 검증·저장한다. Spring이 기본 주입하는 `profile.application.PrivateFactsService`를 호출해야 한다. 서비스가 트랜잭션을 열고 `profile.adapter.JdbcPrivateFactsStore`에 원자적 병합/검증/암호화 저장을 맡긴다. JDBC 구현을 직접 호출할 때 트랜잭션이 없으면 쓰기 전에 거절한다.
- `FactChange(FactKey key, ObjectNode patch, Long expectedRevision, boolean delete)`. patch는 표의 snake_case 필드만 가능하며 생략 필드는 유지한다. null은 nullable 필드의 명시적 제거다. 모델의 추측/미응답을 null이나 false로 바꾸면 안 된다. 필수 필드 제거는 행 삭제 또는 별도의 사용자 결정이 필요하다.
- revision `0`은 신규 행 생성(빈 profile anchor에도 사용), 양수는 정확한 기존 revision 확인, `null`은 기존 행의 최신 값에 부분 병합이다. 일반 동네 저장만 현재 UI에 맞춰 `null`을 사용한다. 상담의 충돌 정책은 별도 담당이 정한다.
- 행 삭제는 `delete=true`, 비어 있거나 null인 patch다. profile 삭제는 anchor를 보존하고 `{}`를 증가한 revision으로 암호화한다. 참조된 가구/구성원 삭제는 의존 행도 같은 요청에서 제거해야 한다.
- 반환은 변경 후 남아 있는 행 목록이다. 삭제된 행은 반환하지 않는다. 오류면 전체 롤백하며 성공 응답을 보내면 안 된다. 요청 ID 멱등 기록·재전송 UX는 이 포트에서 제공하지 않는다.
- `FactKey`: PROFILE은 id=owner, REGION/MEMBERSHIP은 서버 생성 UUID, HOUSEHOLD/HOME/VEHICLE은 기존 대상 UUID. MEMBER는 id=구성원 UUID+householdId, WELFARE는 id=상태 UUID+subjectScope(`self`/`member`)+member 대상이면 householdId/memberId. 그 외 보조 필드는 null.

| FactTable | payload 필드 |
|---|---|
| PROFILE | birth_date, observed_at, source_kind; neighborhood_code/sido/sigungu/dong |
| REGION | relation, region_id, observed_at, source_kind |
| MEMBERSHIP | service_code, is_member, observed_at, source_kind |
| HOUSEHOLD | members_complete, observed_at, source_kind |
| MEMBER | relation_to_applicant, on_resident_register, birth_date, preschool, registered_disability, observed_at, source_kind |
| WELFARE | welfare_code, has_status, observed_at, source_kind |
| HOME | region_id, dwelling_type, electricity_contract_kind, building_approval_date, observed_at, source_kind |
| VEHICLE | registered_region_id, vehicle_kind, fuel_kind, usage_kind, seating_capacity, observed_at, source_kind |

명시적 false를 보존한다. 미확인은 nullable 값/행 없음으로 유지하며 `0`과 동일 취급하지 않는다. 기존 `seating_capacity>0` 제약상 좌석 수 0은 유효한 입력이 아니다. birth_date와 observed_at/source_kind는 함께 기록/제거한다. 관심 동네는 주민등록 거주지 증거가 아니다. `source_kind`는 현재 `user_statement`만 허용한다.

`update_conditions`는 계속 대화 메모리만 변경한다. 대화 종료 시점의 명시적 변경 묶음을 이 포트에 전달하는 연결, 종료 정의·모름/거절 처리·동일 사실 충돌은 별도 작업이다. 새 대화의 기존 `ConditionContext` JSON 계약은 유지한다. 공개 조건 매핑을 먼저 읽고 필요한 소스/선택 대상만 복호화하며 조회 전체는 `ConditionContextService.load`가 여는 REPEATABLE_READ snapshot이다.

공개 참조 코드 `app.regions.region_id`, `app.services.service_code`, `app.welfare_types.welfare_code`는 추가만 허용한다. 암호화된 참조에는 DB FK를 걸 수 없으므로 코드 삭제·이름 변경은 전체 암호화 참조를 조사·변환·검증하는 유지보수 이관으로만 한다. 일반 카탈로그 작업에서 이 코드들을 삭제/교체하면 기존 회원 사실이 고아 참조가 될 수 있다.

## 키 준비

키는 DB/이미지/git/.env 값에 넣지 않는다. 명시적 최초 준비 도구는 기존 파일 덮어쓰기를 거절한다.

```sh
python3 scripts/create-private-facts-keyring.py /secure/eco/private-facts-keyring.json
```

상위 디렉터리는 미리 준비한다. 파일 형식은 `{"activeKeyId":"key-id","keys":{"key-id":"base64-encoded-32-bytes"}}`이며 실제 키를 터미널/로그에 출력하지 않는다. 도구는 0600으로 생성한다. Compose의 `PRIVATE_FACTS_KEYRING_HOST_FILE`을 해당 파일 경로로 설정하고, 실제 backend 컨테이너 UID/GID가 읽을 수 있도록 호스트 소유권/ACL을 설정한다. file-backed Compose secret의 mode 설정만으로 호스트 권한이 바뀐다고 가정하지 않는다. 소스·DB 백업과 분리한 보안 백업을 만든다.

컨테이너의 `PRIVATE_FACTS_KEYRING_FILE=/run/secrets/private_facts_keyring`은 backend에만 연결한다. 직접 실행 시에도 읽을 수 있는 파일 경로를 설정해야 한다. 누락/잘못된 키링은 시작 실패한다. 실행 중 키를 자동 생성하거나 평문으로 돌아가지 않는다. 앱 서버/키 저장소까지 침해된 경우를 이 암호화만으로 방어하지 않는다.

## 유지보수 이관

1. 적용할 릴리스의 migration 목록을 확인한다. 현재 통합 브랜치는 기존 V1~V7(미션·관심사 V4/V6/V7 포함)에 V8/V9/V10을 추가한다. V7 기존 회원·관심사·추천·활동 기록의 V10 이관 보존을 격리 PG에서 검증했다. 이미 상위 버전이 적용된 DB에 낮은 번호를 나중에 추가하지 않는다.
2. 백업과 별도 키 복구를 확인하고 모든 기존/신규 앱의 사용자 사실 읽기·쓰기를 중지한다. 구버전 앱은 암호화 스키마와 호환되지 않는다.
3. 준비한 키링으로 `PRIVATE_FACTS_MIGRATION_ENABLED=true`를 명시한 새 backend를 외부 요청 없이 시작한다. Flyway V8이 envelope/opaque ID를 추가하고 Spring JavaMigration V9가 모든 평문을 검증·암호화·복호화 대조한다. V10은 모든 행의 이관 완료를 확인한 뒤 평문 열과 DB 내 개인 조건 함수를 제거한다.
4. 이관 실패 시 트래픽을 계속 중지한다. 단계별 트랜잭션이므로 V8/V9만 완료된 상태에서는 평문이 남을 수 있다. 임의 repair/평문 fallback 대신 원인을 보완하고 재실행하거나 검증한 백업으로 복구한다.
5. 성공·조건 조회·동네 저장을 확인한 뒤 `PRIVATE_FACTS_MIGRATION_ENABLED=false`로 돌아가 서비스를 연다. 빈 DB 최초 설치도 같은 명시적 이관 설정이 필요하다.

열 삭제는 과거 백업/WAL/디스크 사본을 지우지 않는다. 기존 평문 사본의 접근·보존/폐기는 별도로 처리해야 한다. DB 권한 분리는 사용자가 정한 후속 작업이며 이 변경에 포함되지 않는다.

## 키 교체

새 키 ID와 독립적인 32바이트 키를 키링에 추가하고 activeKeyId를 전환한다. 이전 키를 유지한 상태로 backend를 재시작하면 구 키 행을 읽고 새 쓰기는 새 키로 저장한다. 유지보수 작업자는 owner별 트랜잭션에서 기존 행에 빈 patch를 적용해 전체 행을 새 키로 재암호화할 수 있다. 이때 수정과 동일하게 revision이 증가하므로 대기 중 상담 변경과 충돌할 수 있다. 자동 배치/관리 HTTP endpoint는 제공하지 않는다.

8개 테이블의 key_id별 행 수와 복호화 대조가 완료되고 구 키가 필요한 백업의 복구 정책까지 정리된 뒤에만 구 키를 제거한다. 키 소실은 데이터 복구 불가로 이어진다. GCM은 소유자·대상·버전·revision의 독립적인 변조나 서로 다른 문맥의 암호문 혼합을 검출한다. 다만 과거에 유효했던 한 행의 envelope 전체(key_id/nonce/ciphertext/revision 포함)를 되돌리는 재생이나 전체 DB snapshot 복원을 감지하는 별도 원장은 아니다.

## 검사

`backend`에서 `mvn test`는 단위/웹 보안 검사를 실행한다. 실제 PostgreSQL 이관 시험은 `PRIVATE_FACTS_TEST_DATABASE_URL=jdbc:postgresql://<isolated-host>:5432/eco_private_facts_test`를 명시해야 실행된다. 해당 시험은 eco_test 계정으로 전용 DB의 app schema를 지우므로 운영 주소를 사용하지 않는다. 테스트 DB는 외부 노출 없는 격리 환경에서 만들어야 한다. 환경 변수가 없으면 DB/실제 Spring 기동 통합 검사 3개는 skipped다.
