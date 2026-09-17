-- Fail before removing any legacy values if the Java backfill did not run.
DO $$
DECLARE t text; incomplete boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_profiles','user_regions','user_memberships','user_households',
      'household_members','user_welfare_statuses','user_homes','user_vehicles'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM app.%I WHERE payload_version IS NULL OR key_id IS NULL
      OR nonce IS NULL OR ciphertext IS NULL OR revision <> 1)',t) INTO incomplete;
    IF incomplete THEN RAISE EXCEPTION 'PRIVATE_FACTS_BACKFILL_REQUIRED'; END IF;
  END LOOP;
END $$;

DROP FUNCTION app.user_detail_context(uuid,text,text,uuid,uuid,uuid);
DROP FUNCTION app.user_benefit_context(uuid,text,text);

-- Remove the old four-column dependency before the encrypted applicant relation.
ALTER TABLE app.user_welfare_statuses DROP COLUMN member_is_applicant;
ALTER TABLE app.household_members DROP COLUMN is_applicant;
ALTER TABLE app.user_welfare_statuses ADD CONSTRAINT welfare_member_structure
  FOREIGN KEY(user_id,household_id,member_id) REFERENCES app.household_members(user_id,household_id,member_id);

ALTER TABLE app.user_profiles DROP COLUMN birth_date, DROP COLUMN observed_at, DROP COLUMN source_kind,
  DROP COLUMN neighborhood_code, DROP COLUMN neighborhood_sido, DROP COLUMN neighborhood_sigungu, DROP COLUMN neighborhood_dong;
ALTER TABLE app.user_regions DROP CONSTRAINT user_regions_pkey;
ALTER TABLE app.user_regions DROP COLUMN relation, DROP COLUMN region_id, DROP COLUMN observed_at, DROP COLUMN source_kind,
  ADD PRIMARY KEY(region_fact_id);
ALTER TABLE app.user_memberships DROP CONSTRAINT user_memberships_pkey;
ALTER TABLE app.user_memberships DROP COLUMN service_code, DROP COLUMN is_member, DROP COLUMN observed_at, DROP COLUMN source_kind,
  ADD PRIMARY KEY(membership_fact_id);
ALTER TABLE app.user_households DROP COLUMN members_complete, DROP COLUMN observed_at, DROP COLUMN source_kind;
ALTER TABLE app.household_members DROP COLUMN relation_to_applicant, DROP COLUMN on_resident_register,
  DROP COLUMN birth_date, DROP COLUMN preschool, DROP COLUMN registered_disability, DROP COLUMN observed_at, DROP COLUMN source_kind;
ALTER TABLE app.user_welfare_statuses DROP COLUMN welfare_code, DROP COLUMN has_status, DROP COLUMN observed_at, DROP COLUMN source_kind;
ALTER TABLE app.user_homes DROP COLUMN region_id, DROP COLUMN dwelling_type, DROP COLUMN electricity_contract_kind,
  DROP COLUMN building_approval_date, DROP COLUMN observed_at, DROP COLUMN source_kind;
ALTER TABLE app.user_vehicles DROP COLUMN registered_region_id, DROP COLUMN vehicle_kind, DROP COLUMN fuel_kind,
  DROP COLUMN usage_kind, DROP COLUMN seating_capacity, DROP COLUMN observed_at, DROP COLUMN source_kind;

CREATE INDEX user_regions_owner ON app.user_regions(user_id);
CREATE INDEX user_memberships_owner ON app.user_memberships(user_id);
CREATE INDEX user_welfare_owner ON app.user_welfare_statuses(user_id);
DO $$
DECLARE t text; valid text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_profiles','user_regions','user_memberships','user_households',
      'household_members','user_welfare_statuses','user_homes','user_vehicles'] LOOP
    valid := '(payload_version IS NOT NULL AND key_id IS NOT NULL AND nonce IS NOT NULL AND ciphertext IS NOT NULL
      AND payload_version=1 AND length(btrim(key_id))>0 AND octet_length(nonce)=12 AND octet_length(ciphertext)>=16 AND revision>0)';
    IF t='user_profiles' THEN
      valid := '('||valid||' OR (payload_version IS NULL AND key_id IS NULL AND nonce IS NULL AND ciphertext IS NULL AND revision=0))';
    ELSE
      EXECUTE format('ALTER TABLE app.%I ALTER COLUMN payload_version SET NOT NULL, ALTER COLUMN key_id SET NOT NULL,
        ALTER COLUMN nonce SET NOT NULL, ALTER COLUMN ciphertext SET NOT NULL',t);
    END IF;
    EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT private_fact_envelope CHECK (%s)',t,valid);
  END LOOP;
END $$;
