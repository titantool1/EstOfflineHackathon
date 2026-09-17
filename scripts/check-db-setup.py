#!/usr/bin/env python3
"""Check the installed team DB baseline only; synthetic lookup changes are rolled back."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def sql(query):
    result = subprocess.run(["docker", "compose", "exec", "-T", "postgres", "sh", "-ec",
        'exec psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'],
        cwd=ROOT, input=query, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise SystemExit(result.stderr)
    return result.stdout.strip()

def main():
    expected = {"catalog_program": 69, "catalog_action": 106, "catalog_condition": 263,
        "catalog_source": 106, "action_condition": 337, "condition_source": 308,
        "common_group": 31, "group_condition": 198, "district": 25, "place": 9,
        "services": 5, "welfare_types": 7, "user_input_definitions": 3,
        "benefit_condition_inputs": 45, "detail_input_definitions": 15, "detail_condition_inputs": 59}
    pairs = ",".join(f"'{table}',(SELECT count(*) FROM app.{table})" for table in expected)
    counts = json.loads(sql(f"SELECT jsonb_build_object({pairs});"))
    if counts != expected: raise SystemExit(f"Imported counts differ: {counts}")
    migrations = json.loads(sql("SELECT jsonb_agg(jsonb_build_object('version',version,'success',success,'checksum',checksum) ORDER BY installed_rank) FROM app.flyway_schema_history WHERE version IS NOT NULL;"))
    if [(m['version'], m['success']) for m in migrations] != [('1', True), ('2', True)]:
        raise SystemExit(f"Unexpected migration history: {migrations}")
    user_tables = ['user_profiles', 'user_regions', 'user_memberships', 'user_households',
        'household_members', 'user_welfare_statuses', 'user_homes', 'user_vehicles']
    for table in user_tables:
        if sql(f"SELECT to_regclass('app.{table}') IS NOT NULL;") != 't':
            raise SystemExit(f"Missing user table: {table}")
    # No real account or region is required. This entire sample transaction rolls back.
    checks = json.loads(sql("""
BEGIN;
SET LOCAL search_path TO app, public;
INSERT INTO users VALUES ('00000000-0000-4000-8000-999999999991');
INSERT INTO user_memberships VALUES ('00000000-0000-4000-8000-999999999991', 'eco_mileage', false, '2026-09-17T00:00:00Z', 'user_statement');
SELECT jsonb_build_object(
 'catalog_lookup', (benefit_lookup('scheme:G031','G031-A01')->>'action_id')='G031-A01',
 'known_false', EXISTS(SELECT 1 FROM jsonb_array_elements(user_benefit_context('00000000-0000-4000-8000-999999999991','scheme:SEOUL-EM-BLDG-2026','SEOUL-EM-BLDG-2026-A01')->'inputs') i WHERE i->>'input_key'='membership.is_member' AND i->'user_fact'->'value'='false'::jsonb AND i->'known'='true'::jsonb),
 'unselected_household', EXISTS(SELECT 1 FROM jsonb_array_elements(user_detail_context('00000000-0000-4000-8000-999999999991','scheme:G031','G031-A01',NULL,NULL,NULL)->'inputs') i WHERE i->>'selection_status'='not_selected'),
 'not_evaluated', user_detail_context('00000000-0000-4000-8000-999999999991','scheme:G031','G031-A01',NULL,NULL,NULL)->>'eligibility_status'='not_evaluated');
ROLLBACK;
"""))
    if not all(value is True for value in checks.values()): raise SystemExit(f"Lookup check failed: {checks}")
    if sql("SELECT count(*) FROM app.users WHERE id='00000000-0000-4000-8000-999999999991';") != '0':
        raise SystemExit("Synthetic lookup user remains")
    print(json.dumps({"result":"pass", "counts":counts, "user_tables":user_tables,
        "migrations":migrations, "representative_lookups":checks, "synthetic_user_rolled_back":True}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
