-- Additive current-fact detail tables; run after user-storage.sql.
CREATE TABLE user_households (
 user_id uuid REFERENCES users(id), household_id uuid,
 members_complete boolean NOT NULL DEFAULT false,
 observed_at timestamptz NOT NULL, source_kind text NOT NULL CHECK(source_kind='user_statement'),
 PRIMARY KEY(user_id,household_id)
);
CREATE TABLE household_members (
 user_id uuid,household_id uuid,member_id uuid,
 relation_to_applicant text CHECK(relation_to_applicant IN ('self','spouse','child','parent','other')),
 is_applicant boolean GENERATED ALWAYS AS (relation_to_applicant='self') STORED,
 on_resident_register boolean,
 birth_date date, preschool boolean, registered_disability boolean,
 observed_at timestamptz NOT NULL,source_kind text NOT NULL CHECK(source_kind='user_statement'),
 PRIMARY KEY(user_id,household_id,member_id),
 UNIQUE(user_id,household_id,member_id,is_applicant),
 FOREIGN KEY(user_id,household_id) REFERENCES user_households,
 CHECK(relation_to_applicant IS NOT NULL),
 CHECK(NOT is_applicant OR birth_date IS NULL),
 CHECK(birth_date <= (observed_at AT TIME ZONE 'Asia/Seoul')::date)
);
CREATE UNIQUE INDEX one_current_applicant_household ON household_members(user_id) WHERE is_applicant;
CREATE TABLE welfare_types(welfare_code text PRIMARY KEY,title text NOT NULL);
CREATE TABLE user_welfare_statuses (
 status_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
 subject_scope text NOT NULL CHECK(subject_scope IN ('self','member')),
 household_id uuid,member_id uuid,
 member_is_applicant boolean GENERATED ALWAYS AS (CASE WHEN subject_scope='member' THEN false ELSE NULL END) STORED,
 welfare_code text NOT NULL REFERENCES welfare_types,has_status boolean NOT NULL,
 observed_at timestamptz NOT NULL,source_kind text NOT NULL CHECK(source_kind='user_statement'),
 CHECK((subject_scope='self' AND household_id IS NULL AND member_id IS NULL) OR
       (subject_scope='member' AND household_id IS NOT NULL AND member_id IS NOT NULL)),
 FOREIGN KEY(user_id,household_id,member_id,member_is_applicant)
 REFERENCES household_members(user_id,household_id,member_id,is_applicant)
);
CREATE UNIQUE INDEX welfare_self_unique ON user_welfare_statuses(user_id,welfare_code) WHERE subject_scope='self';
CREATE UNIQUE INDEX welfare_member_unique ON user_welfare_statuses(user_id,household_id,member_id,welfare_code) WHERE subject_scope='member';
CREATE TABLE user_homes (
 user_id uuid REFERENCES users(id),home_id uuid,
 region_id text REFERENCES regions,
 dwelling_type text CHECK(dwelling_type IN ('apartment','detached','multi_family','non_residential','other')),
 electricity_contract_kind text CHECK(electricity_contract_kind IN ('residential','general','industrial','other')),
 building_approval_date date,
 observed_at timestamptz NOT NULL,source_kind text NOT NULL CHECK(source_kind='user_statement'),
 PRIMARY KEY(user_id,home_id),CHECK(building_approval_date<=(observed_at AT TIME ZONE 'Asia/Seoul')::date)
);
CREATE TABLE user_vehicles (
 user_id uuid REFERENCES users(id),vehicle_id uuid,
 registered_region_id text REFERENCES regions,
 vehicle_kind text CHECK(vehicle_kind IN ('passenger_car','van','truck','motorcycle','other')),
 fuel_kind text CHECK(fuel_kind IN ('gasoline','diesel','lpg','electric','hydrogen','hybrid','other')),
 usage_kind text CHECK(usage_kind IN ('private','commercial','other')),
 seating_capacity integer CHECK(seating_capacity>0),
 observed_at timestamptz NOT NULL,source_kind text NOT NULL CHECK(source_kind='user_statement'),
 PRIMARY KEY(user_id,vehicle_id)
);

-- Readable field registry. The allow-list is the physical schema, not policy keywords.
CREATE TABLE detail_input_definitions (
 input_key text PRIMARY KEY,domain text NOT NULL,field_name text NOT NULL,value_type text NOT NULL,
 CHECK((domain='welfare' AND field_name='has_status' AND value_type='boolean') OR
       (domain='member' AND field_name='birth_date' AND value_type='date') OR
       (domain='member' AND field_name IN ('preschool','registered_disability','on_resident_register') AND value_type='boolean') OR
       (domain='member' AND field_name='relation_to_applicant' AND value_type='text') OR
       (domain='home' AND field_name IN ('region_id','dwelling_type','electricity_contract_kind') AND value_type='text') OR
       (domain='home' AND field_name='building_approval_date' AND value_type='date') OR
       (domain='vehicle' AND field_name IN ('registered_region_id','vehicle_kind','fuel_kind','usage_kind') AND value_type='text') OR
       (domain='vehicle' AND field_name='seating_capacity' AND value_type='integer')),
 UNIQUE(input_key,domain)
);
CREATE TABLE detail_condition_inputs (
 program_key text,action_id text,condition_id text,input_key text,domain text NOT NULL,
 subject_scope text NOT NULL CHECK(subject_scope IN ('self','household','home','vehicle')),
 welfare_code text REFERENCES welfare_types,
 selector_code text GENERATED ALWAYS AS (subject_scope||':'||COALESCE(welfare_code,'')) STORED,
 PRIMARY KEY(program_key,action_id,condition_id,input_key,selector_code),
 FOREIGN KEY(program_key,action_id,condition_id) REFERENCES action_condition,
 FOREIGN KEY(input_key,domain) REFERENCES detail_input_definitions(input_key,domain),
 CHECK((domain='welfare' AND welfare_code IS NOT NULL AND subject_scope IN ('self','household')) OR
       (domain='member' AND welfare_code IS NULL AND subject_scope='household') OR
       (domain='home' AND welfare_code IS NULL AND subject_scope='home') OR
       (domain='vehicle' AND welfare_code IS NULL AND subject_scope='vehicle'))
);

CREATE FUNCTION user_detail_context(p_user uuid,p_program text,p_action text,
 p_household uuid,p_home uuid,p_vehicle uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE base jsonb;added jsonb;unmapped jsonb;
BEGIN
 base:=user_benefit_context(p_user,p_program,p_action);
 IF base IS NULL THEN RETURN NULL; END IF;
 IF p_household IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_households WHERE user_id=p_user AND household_id=p_household) THEN
  RAISE EXCEPTION 'household not in requested user scope' USING ERRCODE='22023'; END IF;
 IF p_home IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_homes WHERE user_id=p_user AND home_id=p_home) THEN
  RAISE EXCEPTION 'home not in requested user scope' USING ERRCODE='22023'; END IF;
 IF p_vehicle IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_vehicles WHERE user_id=p_user AND vehicle_id=p_vehicle) THEN
  RAISE EXCEPTION 'vehicle not in requested user scope' USING ERRCODE='22023'; END IF;
 WITH wanted AS (
  SELECT b.input_key,d.domain,d.field_name,d.value_type,b.subject_scope,b.welfare_code,b.selector_code,
   jsonb_agg(b.condition_id ORDER BY b.condition_id) AS condition_ids
  FROM detail_condition_inputs b JOIN detail_input_definitions d USING(input_key,domain)
  WHERE b.program_key=p_program AND b.action_id=p_action
  GROUP BY b.input_key,d.domain,d.field_name,d.value_type,b.subject_scope,b.welfare_code,b.selector_code
 ), facts AS (
 SELECT w.*, CASE
 WHEN w.domain='welfare' AND w.subject_scope='self' THEN (
  SELECT jsonb_build_object('value',s.has_status,'observed_at',s.observed_at,'source_kind',s.source_kind)
  FROM user_welfare_statuses s WHERE s.user_id=p_user AND s.subject_scope='self' AND s.welfare_code=w.welfare_code)
 WHEN w.domain IN ('member','welfare') THEN (
  SELECT jsonb_build_object('household_id',h.household_id,'members_complete',h.members_complete,
   'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id',m.member_id,
     'relation_to_applicant',m.relation_to_applicant,'on_resident_register',m.on_resident_register,
     'fact',CASE WHEN w.domain='welfare' THEN (
       SELECT jsonb_build_object('value',s.has_status,'observed_at',s.observed_at,'source_kind',s.source_kind)
       FROM user_welfare_statuses s WHERE s.user_id=p_user AND s.welfare_code=w.welfare_code AND
       ((m.is_applicant AND s.subject_scope='self') OR
        (NOT m.is_applicant AND s.subject_scope='member' AND s.household_id=m.household_id AND s.member_id=m.member_id)))
     WHEN m.is_applicant AND w.field_name='birth_date' THEN (
       SELECT jsonb_build_object('value',p.birth_date,'observed_at',p.observed_at,'source_kind',p.source_kind)
       FROM user_profiles p WHERE p.user_id=p_user AND p.birth_date IS NOT NULL)
     WHEN to_jsonb(m)->w.field_name <> 'null'::jsonb THEN
       jsonb_build_object('value',to_jsonb(m)->w.field_name,'observed_at',m.observed_at,'source_kind',m.source_kind)
     ELSE NULL END) ORDER BY m.member_id)
    FROM household_members m WHERE m.user_id=p_user AND m.household_id=h.household_id),'[]'::jsonb))
  FROM user_households h WHERE h.user_id=p_user AND h.household_id=p_household)
 WHEN w.domain='home' THEN (
  SELECT CASE WHEN to_jsonb(h)->w.field_name <> 'null'::jsonb THEN
   jsonb_build_object('entity_id',h.home_id,'value',to_jsonb(h)->w.field_name,'observed_at',h.observed_at,'source_kind',h.source_kind) END
  FROM user_homes h WHERE h.user_id=p_user AND h.home_id=p_home)
 WHEN w.domain='vehicle' THEN (
  SELECT CASE WHEN to_jsonb(v)->w.field_name <> 'null'::jsonb THEN
   jsonb_build_object('entity_id',v.vehicle_id,'value',to_jsonb(v)->w.field_name,'observed_at',v.observed_at,'source_kind',v.source_kind) END
  FROM user_vehicles v WHERE v.user_id=p_user AND v.vehicle_id=p_vehicle)
 END AS fact FROM wanted w
 ) SELECT COALESCE(jsonb_agg(jsonb_build_object('input_key',input_key,
 'selector',jsonb_strip_nulls(jsonb_build_object('subject_scope',subject_scope,'welfare_code',welfare_code)),
 'condition_ids',condition_ids,'value_type',value_type,
 'value_shape',CASE WHEN subject_scope='household' THEN 'by_member' ELSE 'scalar' END,
 'selection_status',CASE WHEN subject_scope='household' AND p_household IS NULL OR
  subject_scope='home' AND p_home IS NULL OR subject_scope='vehicle' AND p_vehicle IS NULL
  THEN 'not_selected' ELSE 'selected_or_self' END,
 'user_fact',fact) ORDER BY input_key,selector_code),'[]'::jsonb) INTO added FROM facts;
 SELECT COALESCE(jsonb_agg(ac.condition_id ORDER BY ac.condition_id),'[]'::jsonb) INTO unmapped
 FROM action_condition ac WHERE ac.program_key=p_program AND ac.action_id=p_action
 AND NOT EXISTS(SELECT 1 FROM benefit_condition_inputs b WHERE b.program_key=ac.program_key AND b.action_id=ac.action_id AND b.condition_id=ac.condition_id)
 AND NOT EXISTS(SELECT 1 FROM detail_condition_inputs b WHERE b.program_key=ac.program_key AND b.action_id=ac.action_id AND b.condition_id=ac.condition_id);
 RETURN base || jsonb_build_object('inputs',(base->'inputs')||added,
  'conditions_without_user_binding',unmapped,
  'selected_entities',jsonb_build_object('household_id',p_household,'home_id',p_home,'vehicle_id',p_vehicle));
END $$;
