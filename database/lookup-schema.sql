-- Mapping/query test only. No user tables or eligibility evaluation.
CREATE TABLE catalog_program(program_key text PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE catalog_source(program_key text REFERENCES catalog_program,source_id text,payload jsonb NOT NULL,
 PRIMARY KEY(program_key,source_id));
CREATE TABLE catalog_condition(program_key text REFERENCES catalog_program,condition_id text,payload jsonb NOT NULL,
 PRIMARY KEY(program_key,condition_id));
CREATE TABLE condition_source(program_key text,condition_id text,source_id text,
 PRIMARY KEY(program_key,condition_id,source_id),
 FOREIGN KEY(program_key,condition_id) REFERENCES catalog_condition,
 FOREIGN KEY(program_key,source_id) REFERENCES catalog_source);
CREATE TABLE overview_source(program_key text,source_id text,PRIMARY KEY(program_key,source_id),
 FOREIGN KEY(program_key,source_id) REFERENCES catalog_source);
CREATE TABLE catalog_action(program_key text REFERENCES catalog_program,action_id text,identity_basis text NOT NULL,
 PRIMARY KEY(program_key,action_id));
CREATE TABLE action_condition(program_key text,action_id text,condition_id text,basis text NOT NULL,
 PRIMARY KEY(program_key,action_id,condition_id),
 FOREIGN KEY(program_key,action_id) REFERENCES catalog_action,
 FOREIGN KEY(program_key,condition_id) REFERENCES catalog_condition);
CREATE TABLE common_group(group_key text PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE group_condition(group_key text REFERENCES common_group,program_key text,condition_id text,
 PRIMARY KEY(group_key,program_key,condition_id),
 FOREIGN KEY(program_key,condition_id) REFERENCES catalog_condition);
CREATE TABLE district(district_name text PRIMARY KEY);
CREATE TABLE program_district(program_key text PRIMARY KEY REFERENCES catalog_program,district_name text REFERENCES district,
 relation text NOT NULL CHECK(relation='catalog_district_not_residence_requirement'));
CREATE TABLE place(place_id text PRIMARY KEY,title text NOT NULL,address text NOT NULL,district_name text REFERENCES district);
CREATE TABLE action_place(program_key text,action_id text,place_id text REFERENCES place,service_key text,
 source_id text NOT NULL,schedule jsonb NOT NULL,announced_start date,announced_end_exclusive date,
 status text CHECK(status IN ('unknown','closed')),
 PRIMARY KEY(program_key,action_id,place_id,service_key),
 FOREIGN KEY(program_key,action_id) REFERENCES catalog_action,
 FOREIGN KEY(program_key,source_id) REFERENCES catalog_source,
 CHECK(announced_start IS NULL OR announced_end_exclusive IS NULL OR announced_start<announced_end_exclusive));

-- Each collection is aggregated independently to avoid conditions × sources × groups fan-out.
CREATE VIEW condition_details AS
 SELECT c.program_key,c.condition_id,c.payload AS condition,
 COALESCE((SELECT jsonb_agg(s.payload ORDER BY s.source_id) FROM condition_source cs
 JOIN catalog_source s USING(program_key,source_id)
 WHERE cs.program_key=c.program_key AND cs.condition_id=c.condition_id),'[]'::jsonb) AS sources,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('group_key',g.group_key,'definition',g.payload) ORDER BY g.group_key)
 FROM group_condition gc JOIN common_group g USING(group_key)
 WHERE gc.program_key=c.program_key AND gc.condition_id=c.condition_id),'[]'::jsonb) AS common_groups
 FROM catalog_condition c;

CREATE FUNCTION benefit_lookup(p_program text,p_action text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('program_key',a.program_key,'action_id',a.action_id,'identity_basis',a.identity_basis,
 'title',p.payload->'title','program_status',p.payload->'status',
 'conditions',COALESCE((SELECT jsonb_agg(jsonb_build_object('condition',d.condition,'sources',d.sources,
 'common_groups',d.common_groups,'mapping_basis',ac.basis) ORDER BY d.condition_id)
 FROM action_condition ac JOIN condition_details d USING(program_key,condition_id)
 WHERE ac.program_key=a.program_key AND ac.action_id=a.action_id),'[]'::jsonb),
 'places',COALESCE((SELECT jsonb_agg(jsonb_build_object('place_id',pl.place_id,'title',pl.title,'address',pl.address,
 'district',pl.district_name,'service_key',ap.service_key,'schedule',ap.schedule,'status',ap.status,
 'announced_start',ap.announced_start,'announced_end_exclusive',ap.announced_end_exclusive,'source',s.payload)
 ORDER BY pl.place_id,ap.service_key)
 FROM action_place ap JOIN place pl USING(place_id) JOIN catalog_source s USING(program_key,source_id)
 WHERE ap.program_key=a.program_key AND ap.action_id=a.action_id),'[]'::jsonb))
 FROM catalog_action a JOIN catalog_program p USING(program_key)
 WHERE a.program_key=p_program AND a.action_id=p_action;
$$;
