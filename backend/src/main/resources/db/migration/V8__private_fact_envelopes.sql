-- Expansion only. V9 must encrypt and verify legacy values before V10 removes them.
-- V4/V6/V7 belong to the parallel interest/mission migrations; merge them before deployment.
ALTER TABLE app.user_regions ADD COLUMN region_fact_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE app.user_memberships ADD COLUMN membership_fact_id uuid NOT NULL DEFAULT gen_random_uuid();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_profiles','user_regions','user_memberships','user_households',
      'household_members','user_welfare_statuses','user_homes','user_vehicles'] LOOP
    EXECUTE format('ALTER TABLE app.%I ADD COLUMN payload_version smallint,
      ADD COLUMN key_id text, ADD COLUMN nonce bytea, ADD COLUMN ciphertext bytea,
      ADD COLUMN revision bigint NOT NULL DEFAULT 0',t);
  END LOOP;
END $$;
