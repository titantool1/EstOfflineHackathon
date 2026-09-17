-- Source: database/interest-mapping-source.md
-- Topic associations for recommendation input. They do not assert benefit eligibility
-- or that a catalog action is identical to a future user-facing mission.
CREATE TABLE catalog_interest (
 interest_id text PRIMARY KEY,
 title text NOT NULL,
 description text NOT NULL
);

CREATE TABLE catalog_action_interest (
 program_key text NOT NULL,
 action_id text NOT NULL,
 interest_id text NOT NULL REFERENCES catalog_interest(interest_id),
 mapping_basis text NOT NULL,
 PRIMARY KEY(program_key,action_id,interest_id),
 FOREIGN KEY(program_key,action_id) REFERENCES catalog_action(program_key,action_id)
);

INSERT INTO catalog_interest (interest_id,title,description) VALUES
 ('green-mobility','교통비·친환경 이동','대중교통·자전거·친환경차'),
 ('green-shopping','친환경 쇼핑·장보기','친환경제품·먹거리 할인'),
 ('energy-saving','전기·난방비 절약','절약·캐시백·요금 지원'),
 ('home-upgrade','집·가전 개선','고효율가전·주택·태양광'),
 ('waste-reduction','재활용·쓰레기 줄이기','폐가전·빈병·음식물'),
 ('eco-learning','환경 체험·배우기','교육·체험·기후행동'),
 ('unsure','아직 잘 모르겠어요','운영 중이며 자격조건이 적은 제도를 분야별로 3~5개 추천');

-- Programs named without an action qualifier project to every current action in that program.
INSERT INTO catalog_action_interest (program_key,action_id,interest_id,mapping_basis)
SELECT a.program_key,a.action_id,m.interest_id,
       '사용자 최종 매핑표: 명시 프로그램의 현행 행동 전체'
FROM (VALUES
 ('green-mobility','scheme:G003'),
 ('green-mobility','scheme:G008'),
 ('green-mobility','scheme:SDG-ZEV-2026'),
 ('green-mobility','scheme:G007'),
 ('green-shopping','scheme:G004'),
 ('green-shopping','scheme:G034'),
 ('green-shopping','scheme:G035'),
 ('green-shopping','scheme:G024'),
 ('energy-saving','scheme:G021'),
 ('energy-saving','scheme:G031'),
 ('energy-saving','scheme:G048'),
 ('energy-saving','scheme:G070'),
 ('energy-saving','scheme:G075'),
 ('energy-saving','scheme:G080'),
 ('energy-saving','scheme:SEOUL-EM-BLDG-2026'),
 ('home-upgrade','scheme:G022'),
 ('home-upgrade','scheme:G027'),
 ('home-upgrade','scheme:G047'),
 ('home-upgrade','scheme:G101'),
 ('home-upgrade','scheme:SDG-FOOD-REDUCER-H2-2026'),
 ('waste-reduction','scheme:G038'),
 ('waste-reduction','scheme:G042'),
 ('waste-reduction','scheme:SDG-FOOD-REDUCER-H2-2026'),
 ('eco-learning','scheme:G002'),
 ('eco-learning','scheme:G039'),
 ('eco-learning','scheme:G117'),
 ('eco-learning','scheme:G007')
) AS m(interest_id,program_key)
JOIN catalog_action a ON a.program_key=m.program_key;

-- Programs qualified by topic project only to the actions supported by their conditions.
INSERT INTO catalog_action_interest
 (program_key,action_id,interest_id,mapping_basis) VALUES
 ('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A01','green-shopping','전자영수증 발급(C02)'),
 ('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A07','green-shopping','친환경제품 구매(C08)'),
 ('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A02','waste-reduction','텀블러·다회용컵 이용(C03)'),
 ('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A05','waste-reduction','다회용기 이용(C06)'),
 ('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A08','waste-reduction','고품질 재활용품 배출(C09)'),
 ('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A17','waste-reduction','개인용기 식품 포장(C18)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A01','waste-reduction','음식물 감량 참여 확정(C05)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A02','waste-reduction','음식물 10% 이상 감량(C06)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A03','waste-reduction','음식물 20% 이상 감량(C07)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A04','waste-reduction','음식물 30% 이상 감량(C08)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A07','eco-learning','환경 관련 퀴즈(C11)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A08','eco-learning','온라인 이벤트(C12)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A09','eco-learning','행동실천형 행사(C13)'),
 ('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A10','eco-learning','현장 행사·환경교육(C14)');
