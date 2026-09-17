#!/usr/bin/env python3
"""Reproduce the frozen development migrations from the verified 3b5fd2c inputs.

No database connection or test execution. Existing migrations are never overwritten.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from catalog import build_catalog
from detail_mapping import DEFINITIONS, WELFARE_TYPES, bindings

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
MIGRATIONS = ROOT / "backend/src/main/resources/db/migration"

def literal(value):
    if value is None: return "NULL"
    if isinstance(value, (dict, list)): return literal(json.dumps(value, ensure_ascii=False)) + "::jsonb"
    return "'" + str(value).replace("'", "''") + "'"

def catalog_links():
    programs={}; statements=[]
    def insert(table,*values): statements.append('INSERT INTO '+table+' VALUES ('+','.join(literal(v) for v in values)+');')
    for kind,folder in [('scheme','schemes.json'),('district','districts.json')]:
        data=json.loads((HERE/'fixtures'/'catalog'/folder).read_text())
        condition_owner={}
        for p in data['programs']:
            pk=kind+':'+p['program_id']; programs[pk]=p
            actions=p.get('action_ids',[f"candidate:{p['program_id']}"])
            for aid in actions:
                insert('catalog_action',pk,aid,'source_action_id' if kind=='scheme' else 'local_candidate_id')
            for c in p['conditions']:
                if c['id'] in condition_owner: raise ValueError('ambiguous condition ID')
                condition_owner[c['id']]=pk
            if kind=='district':
                for c in p['conditions']:
                    insert('action_condition',pk,actions[0],c['id'],'candidate_detail')
        for g in data['common_groups']:
            gid=kind+':'+g['id']
            insert('common_group',gid,g)
            for cid in g['condition_ids']:
                insert('group_condition',gid,condition_owner[cid],cid)
    links=json.loads((HERE/'action_links.json').read_text())
    source_pairs={(pk,c['id']) for pk,p in programs.items() if pk.startswith('scheme:') for c in p['conditions']}
    if {(x['program_key'],x['condition_id']) for x in links}!=source_pairs or len(links)!=len(source_pairs):
        raise ValueError('mapping not exactly one row per original condition')
    for x in links:
        # Independent expectation from source applies_to, not the loaded mapping itself.
        original=next(c for c in programs[x['program_key']]['conditions'] if c['id']==x['condition_id'])
        applies=original['applies_to']
        span=re.search(r'A(\d{2})~A(\d{2})',applies)
        explicit=re.findall(r'(?<![A-Za-z0-9])A(\d{2})(?!\d)',applies)
        pid=x['program_key'].removeprefix('scheme:')
        independent=([f'{pid}-A{i:02d}' for i in range(int(span[1]),int(span[2])+1)] if span
                     else sorted({f'{pid}-A{i}' for i in explicit}) if explicit else None)
        if independent is not None and sorted(x['action_ids'])!=independent:
            raise ValueError('source applies_to mapping mismatch: '+x['condition_id'])
        for aid in x['action_ids']:
            insert('action_condition',x['program_key'],aid,x['condition_id'],x['basis'])
    districts=sorted({p['district'] for pk,p in programs.items() if pk.startswith('district:')})
    for name in districts: insert('district',name)
    for pk,p in programs.items():
        if pk.startswith('district:'): insert('program_district',pk,p['district'],'catalog_district_not_residence_requirement')
    # All seven named W02 places; S02 only the two explicitly described venue changes.
    sites=[('surak','수락 행복발전소','동일로242길77','07:00-21:00'),
           ('office','노원구청','노해로437','24h'),('park','중계근린공원','동일로1243','24h'),
           ('library','노원어린이도서관','한글비석로346','24h'),('hagye','하계2동주민센터','공릉로55길88','07:00-21:00'),
           ('wolgye','월계보건지소','월계로378','24h'),('gongneung','공릉2동주민센터','노원로1길68','08:00-21:00')]
    for pid,title,address,hours in sites:
        if title not in programs['district:W02']['venue'] or address not in programs['district:W02']['venue']:
            raise ValueError('place not in source snapshot')
        insert('place','W02:'+pid,title,address,'노원구')
        insert('action_place','district:W02','candidate:W02','W02:'+pid,'can-pet-machine','W02-S01',{'hours':hours},None,None,'unknown')
    for pid,title,address,start,end,status in [
        ('new','영중로 거점','영중로27길 3','2026-03-19',None,'unknown'),
        ('closed','도림동 거점','도신로29가길 12',None,'2026-08-21','closed')]:
        if address not in programs['district:S02']['venue']: raise ValueError('venue change not in source')
        insert('place','S02:'+pid,title,address,'영등포구')
        insert('action_place','district:S02','candidate:S02','S02:'+pid,'exchange','S02-S01',
               {'weekday':'Thursday','hours':'15:00-19:00'},start,end,status)
    return "\n".join(statements) + "\n"

def user_mappings():
    draft = json.loads((HERE / "user-input-schema.json").read_text())
    sql = []
    def insert(table, columns, values):
        sql.append(f"INSERT INTO {table}({columns}) VALUES (" + ",".join(literal(v) for v in values) + ");")
    for code, title in draft["service_codes"].items():
        insert("services", "service_code,title", [code, title])
    kinds = {"user_profiles": "profile", "user_regions": "region", "user_memberships": "membership"}
    for key, spec in draft["input_definitions"].items():
        insert("user_input_definitions", "input_key,source_kind", [key, kinds[spec["table"]]])
    for binding in draft["representative_condition_inputs"]:
        source = kinds[draft["input_definitions"][binding["input_key"]]["table"]]
        for action in binding["action_ids"]:
            insert("benefit_condition_inputs", "program_key,action_id,condition_id,input_key,source_kind,relation,service_code",
                [binding["program_key"], action, binding["condition_id"], binding["input_key"], source,
                 binding["selector"].get("relation"), binding["selector"].get("service_code")])
    for code, title in WELFARE_TYPES.items():
        insert("welfare_types", "welfare_code,title", [code, title])
    definitions = {row[0]: row for row in DEFINITIONS}
    for row in DEFINITIONS:
        insert("detail_input_definitions", "input_key,domain,field_name,value_type", row)
    actions = {(r["program_key"], r["condition_id"]): r["action_ids"] for r in json.loads((HERE / "action_links.json").read_text())}
    for row in bindings():
        for action in actions[row["program_key"], row["condition_id"]]:
            insert("detail_condition_inputs", "program_key,action_id,condition_id,input_key,domain,subject_scope,welfare_code",
                [row["program_key"], action, row["condition_id"], row["input_key"], definitions[row["input_key"]][1],
                 row["subject_scope"], row["welfare_code"]])
    return "\n".join(sql) + "\n"

def render():
    schema_inputs = ["reference-schema.sql", "lookup-schema.sql", "user-storage.sql", "detail-storage.sql"]
    schema = "-- Team development baseline from verified 3b5fd2c. Separate from the legacy QA V1-V6 lineage.\n"
    schema += "\n".join("-- Source: database/" + name + "\n" + (HERE / name).read_text() for name in schema_inputs)
    catalog, _ = build_catalog(ROOT)
    seed = "-- Frozen public catalog and input mappings, 2026-09-17. No accounts or personal facts.\n"
    seed += catalog + catalog_links() + user_mappings()
    return {"V1__verified_catalog_and_user_schema.sql": schema, "V2__reviewed_catalog_and_input_mappings.sql": seed}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare generated bytes without writing")
    args = parser.parse_args()
    for name, content in render().items():
        path = MIGRATIONS / name
        if path.exists():
            if path.read_bytes() != content.encode():
                raise SystemExit(f"Frozen migration differs: {name}. Add a new migration; do not overwrite this version.")
        elif args.check:
            raise SystemExit(f"Missing migration: {name}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        print(f"{name}: {hashlib.sha256(content.encode()).hexdigest()}")

if __name__ == "__main__":
    main()
