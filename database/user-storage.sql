-- Additive user storage for the already-tested catalog schema.
-- users(id uuid), regions and services are bootstrap references in this proof.
-- The production authentication key and official region catalog are not installed by this file.
CREATE TABLE user_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 birth_date date,
 observed_at timestamptz,
 source_kind text CHECK(source_kind='user_statement'),
 CHECK ((birth_date IS NULL AND observed_at IS NULL AND source_kind IS NULL) OR
        (birth_date IS NOT NULL AND observed_at IS NOT NULL AND source_kind IS NOT NULL)),
 CHECK (birth_date <= (observed_at AT TIME ZONE 'Asia/Seoul')::date)
);
CREATE TABLE user_regions (
 user_id uuid REFERENCES users(id),
 relation text CHECK(relation IN ('registered_residence','work','study','business')),
 region_id text REFERENCES regions(region_id),
 observed_at timestamptz NOT NULL,
 source_kind text NOT NULL CHECK(source_kind='user_statement'),
 PRIMARY KEY(user_id,relation,region_id)
);
CREATE UNIQUE INDEX user_one_registered_residence ON user_regions(user_id)
 WHERE relation='registered_residence';
CREATE TABLE user_memberships (
 user_id uuid REFERENCES users(id),
 service_code text REFERENCES services(service_code),
 is_member boolean NOT NULL,
 observed_at timestamptz NOT NULL,
 source_kind text NOT NULL CHECK(source_kind='user_statement'),
 PRIMARY KEY(user_id,service_code)
);

CREATE TABLE user_input_definitions (
 input_key text PRIMARY KEY,
 source_kind text NOT NULL CHECK(source_kind IN ('profile','region','membership')),
 UNIQUE(input_key,source_kind)
);
CREATE TABLE benefit_condition_inputs (
 program_key text,action_id text,condition_id text,
 input_key text,source_kind text NOT NULL,
 relation text CHECK(relation IN ('registered_residence','work','study','business')),
 service_code text REFERENCES services(service_code),
 selector_code text GENERATED ALWAYS AS (COALESCE(relation,service_code,'')) STORED,
 PRIMARY KEY(program_key,action_id,condition_id,input_key,selector_code),
 FOREIGN KEY(program_key,action_id,condition_id) REFERENCES action_condition(program_key,action_id,condition_id),
 FOREIGN KEY(input_key,source_kind) REFERENCES user_input_definitions(input_key,source_kind),
 CHECK ((source_kind='profile' AND relation IS NULL AND service_code IS NULL) OR
        (source_kind='region' AND relation IS NOT NULL AND service_code IS NULL) OR
        (source_kind='membership' AND relation IS NULL AND service_code IS NOT NULL))
);

-- Resolve the selected benefit's input dependencies, not all profile fields.
-- Source-family branches are fixed; service/policy/condition choices are data parameters.
CREATE FUNCTION user_benefit_context(p_user uuid,p_program text,p_action text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE benefit jsonb; output jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user) THEN
  RAISE EXCEPTION 'unknown user' USING ERRCODE='22023';
 END IF;
 benefit := benefit_lookup(p_program,p_action);
 IF benefit IS NULL THEN RETURN NULL; END IF;
 WITH wanted AS (
  SELECT input_key,source_kind,relation,service_code,selector_code,
   jsonb_agg(condition_id ORDER BY condition_id) AS condition_ids
  FROM benefit_condition_inputs WHERE program_key=p_program AND action_id=p_action
  GROUP BY input_key,source_kind,relation,service_code,selector_code
 ), facts AS (
  SELECT w.*, CASE w.source_kind
   WHEN 'profile' THEN (
    SELECT jsonb_build_object('value',p.birth_date,'observed_at',p.observed_at,'source_kind',p.source_kind)
    FROM user_profiles p WHERE p.user_id=p_user AND p.birth_date IS NOT NULL)
   WHEN 'membership' THEN (
    SELECT jsonb_build_object('value',m.is_member,'observed_at',m.observed_at,'source_kind',m.source_kind)
    FROM user_memberships m WHERE m.user_id=p_user AND m.service_code=w.service_code)
   WHEN 'region' THEN (
    SELECT jsonb_build_object('value',jsonb_agg(r.region_id ORDER BY r.region_id),
      'evidence',jsonb_agg(jsonb_build_object('region_id',r.region_id,'observed_at',r.observed_at,
      'source_kind',r.source_kind) ORDER BY r.region_id))
    FROM user_regions r WHERE r.user_id=p_user AND r.relation=w.relation HAVING count(*)>0)
  END AS fact FROM wanted w
 )
 SELECT jsonb_build_object('user_id',p_user,'input_mapping_scope','representative_partial',
  'eligibility_status','not_evaluated',
  'inputs',COALESCE((SELECT jsonb_agg(jsonb_build_object('input_key',f.input_key,
   'selector',CASE f.source_kind WHEN 'region' THEN jsonb_build_object('relation',f.relation)
    WHEN 'membership' THEN jsonb_build_object('service_code',f.service_code) ELSE '{}'::jsonb END,
   'condition_ids',f.condition_ids,'known',f.fact IS NOT NULL,'user_fact',f.fact)
   ORDER BY f.input_key,f.selector_code) FROM facts f),'[]'::jsonb),
  'conditions_without_user_binding',COALESCE((SELECT jsonb_agg(ac.condition_id ORDER BY ac.condition_id)
   FROM action_condition ac WHERE ac.program_key=p_program AND ac.action_id=p_action
   AND NOT EXISTS(SELECT 1 FROM benefit_condition_inputs b WHERE b.program_key=ac.program_key
    AND b.action_id=ac.action_id AND b.condition_id=ac.condition_id)),'[]'::jsonb)) INTO output;
 RETURN benefit || output;
END $$;
