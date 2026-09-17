"""Mapping SQL checks only; no imports of the stopped user/eligibility prototype."""
import hashlib
import json
import re
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from catalog import build_catalog

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
REPORT_DIR=Path(os.environ.get("ECO_DB_REPORT_DIR", ROOT/".local"/"db-verification")).resolve()
NAME='eco-db-schema-validation'

def literal(value):
    if value is None: return 'NULL'
    if isinstance(value,(dict,list)): return literal(json.dumps(value,ensure_ascii=False))+'::jsonb'
    return "'"+str(value).replace("'","''")+"'"

def cmd(args,data=None,check=True):
    p=subprocess.run(args,input=data,text=True,capture_output=True,timeout=60)
    if check and p.returncode: raise RuntimeError(p.stderr)
    return p

def sql(q,check=True):
    return cmd(['docker','exec','-i',NAME,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],q,check)

def fetch(q): return json.loads(sql(q).stdout)

def run(addon=None,report_name='lookup-result.json'):
    REPORT_DIR.mkdir(parents=True,exist_ok=True)
    result={'scope':'mapping and SQL lookup only','started_at':datetime.now(timezone.utc).isoformat(),'tests':[]}
    owned=None
    try:
        if cmd(['docker','ps','-a','--filter',f'name=^/{NAME}$','--format','{{.ID}}']).stdout.strip():
            raise RuntimeError('Refusing to reuse existing container')
        result['containers_before']=cmd(['docker','ps','--format','{{.ID}} {{.Names}}']).stdout.splitlines()
        result['image_id']=cmd(['docker','image','inspect','postgres:18.6-bookworm','--format','{{.Id}}']).stdout.strip()
        owned=cmd(['docker','run','--pull','never','--rm','-d','--name',NAME,'--network','none',
                   '--tmpfs','/var/lib/postgresql:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:18.6-bookworm']).stdout.strip()
        for _ in range(60):
            # initdb briefly runs a Unix-socket-only server; wait for the final TCP listener.
            if cmd(['docker','exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres'],check=False).returncode==0: break
            time.sleep(.5)
        else: raise RuntimeError('database not ready')
        catalog_sql,manifest=build_catalog(ROOT)
        result['catalog']=manifest
        programs={}; groups={}; statements=[]; expected={}
        def insert(table,*values): statements.append('INSERT INTO '+table+' VALUES ('+','.join(literal(v) for v in values)+');')
        for kind,folder in [('scheme','schemes.json'),('district','districts.json')]:
            data=json.loads((HERE/'fixtures'/'catalog'/folder).read_text())
            condition_owner={}
            for p in data['programs']:
                pk=kind+':'+p['program_id']; programs[pk]=p
                actions=p.get('action_ids',[f"candidate:{p['program_id']}"])
                for aid in actions:
                    insert('catalog_action',pk,aid,'source_action_id' if kind=='scheme' else 'local_candidate_id')
                    expected[pk,aid]=[]
                for c in p['conditions']:
                    if c['id'] in condition_owner: raise ValueError('ambiguous condition ID')
                    condition_owner[c['id']]=pk
                if kind=='district':
                    for c in p['conditions']:
                        insert('action_condition',pk,actions[0],c['id'],'candidate_detail')
                        expected[pk,actions[0]].append(c['id'])
            for g in data['common_groups']:
                gid=kind+':'+g['id'];groups[gid]=g
                insert('common_group',gid,g)
                for cid in g['condition_ids']:
                    insert('group_condition',gid,condition_owner[cid],cid)
        links=json.loads((HERE/'action_links.json').read_text())
        source_pairs={(pk,c['id']) for pk,p in programs.items() if pk.startswith('scheme:') for c in p['conditions']}
        if {(x['program_key'],x['condition_id']) for x in links}!=source_pairs or len(links)!=len(source_pairs):
            raise ValueError('mapping not exactly one row per original condition')
        unresolved=[]
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
            if not x['action_ids']: unresolved.append(x)
            for aid in x['action_ids']:
                insert('action_condition',x['program_key'],aid,x['condition_id'],x['basis'])
                expected[x['program_key'],aid].append(x['condition_id'])
        result['unresolved_action_links']=unresolved
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
        sql('BEGIN;'+(HERE/'lookup-schema.sql').read_text()+catalog_sql+'\n'.join(statements)+'COMMIT;')
        result['postgres_version']=sql('SHOW server_version;').stdout.strip()
        def check(name,actual,expected_value=True):
            passed=actual==expected_value
            result['tests'].append({'name':name,'passed':passed,'actual':actual,'expected':expected_value})
            if not passed: raise AssertionError(name)
        def reject(name,q,code):
            p=sql('BEGIN;'+q+'ROLLBACK;',False)
            check(name,p.returncode!=0 and code in p.stderr)
            result['tests'][-1]['sqlstate']=code
        check('original catalog payloads preserved',fetch('SELECT jsonb_object_agg(program_key,payload) FROM catalog_program;'),programs)
        # Large comparison is represented by its result; raw source inputs remain available separately.
        result['tests'][-1].update(actual=True,expected=True)
        check('all 263 conditions resolve sources and groups',fetch('SELECT count(*) FROM condition_details;'),263)
        check('all 25 district indexes present',fetch('SELECT count(*) FROM district;'),25)
        check('all original conditions bound to at least one action',fetch('SELECT count(*) FROM catalog_condition c WHERE NOT EXISTS (SELECT 1 FROM action_condition ac WHERE ac.program_key=c.program_key AND ac.condition_id=c.condition_id);'),0)
        outputs=fetch("SELECT jsonb_object_agg(program_key||'/'||action_id,benefit_lookup(program_key,action_id)) FROM catalog_action;")
        for (pk,aid),cids in expected.items():
            out=outputs[pk+'/'+aid]
            check(pk+'/'+aid+' exact condition set, no join duplicates',sorted(c['condition']['id'] for c in out['conditions']),sorted(cids))
            src={s['id']:s for s in programs[pk]['sources']}
            original={c['id']:c for c in programs[pk]['conditions']}
            for row in out['conditions']:
                c=original[row['condition']['id']]
                if row['condition']!=c or row['sources']!=[src[sid] for sid in sorted(c['source_ids'])]:
                    raise AssertionError('condition/source round trip mismatch')
        check('every action lookup retains exact condition body and source URL/status',True)
        check('common group reverse lookup preserves membership',fetch("SELECT jsonb_object_agg(group_key,ids) FROM (SELECT group_key,jsonb_agg(condition_id ORDER BY condition_id) ids FROM group_condition GROUP BY group_key) s;"),{gid:sorted(g['condition_ids']) for gid,g in groups.items()})
        result['tests'][-1].update(actual=True,expected=True)
        check('G031 A01/A02 condition groups separated',
              [sorted(c['condition']['id'] for c in outputs['scheme:G031/G031-'+a]['conditions']) for a in ['A01','A02']],
              [[f'G031-C{i:02d}' for i in range(1,12)],[f'G031-C{i:02d}' for i in range(12,21)]])
        check('quiz does not inherit food reduction conditions',
              sorted(c['condition']['id'] for c in outputs['scheme:SEOUL-EM-GREEN-2026/SEOUL-EM-GREEN-2026-A07']['conditions']),
              ['SEOUL-EM-GREEN-2026-C01','SEOUL-EM-GREEN-2026-C04','SEOUL-EM-GREEN-2026-C11'])
        check('school challenge does not inherit individual app membership',
              'G002-C01' not in [c['condition']['id'] for c in outputs['scheme:G002/G002-A02']['conditions']])
        check('wrong action/program lookup is absent',fetch("SELECT COALESCE(benefit_lookup('scheme:G031','G002-A01'),'null'::jsonb);"),None)
        check('two similar membership conditions retain their own source/program',
              all(next(c for c in outputs['scheme:'+p+'/'+p+'-A01']['conditions'] if c['condition']['id']==p+'-C01')['sources'][0]['id'].startswith(p) for p in ['SEOUL-EM-BLDG-2026','SEOUL-EM-GREEN-2026']))
        check('all seven Nowon venue schedules retained',
              {p['title']:p['schedule']['hours'] for p in outputs['district:W02/candidate:W02']['places']},{title:hours for _,title,_,hours in sites})
        check('unknown live status preserved',all(p['status']=='unknown' for p in outputs['district:W02/candidate:W02']['places']))
        check('closed YDP venue returned with end date and closed status',
              [(p['status'],p['announced_end_exclusive']) for p in outputs['district:S02/candidate:S02']['places'] if p['place_id']=='S02:closed'],[('closed','2026-08-21')])
        check('district filter returns exactly original candidates',fetch("SELECT jsonb_object_agg(district_name,ids) FROM (SELECT district_name,jsonb_agg(program_key ORDER BY program_key) ids FROM program_district GROUP BY district_name) d;"),{d:sorted(pk for pk,p in programs.items() if p.get('district')==d) for d in districts})
        result['tests'][-1].update(actual=True,expected=True)
        check('no user tables installed',fetch("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'user%' OR table_name='household_members');"),0)
        reject('nonexistent action rejected',"INSERT INTO action_condition VALUES ('scheme:G031','missing','G031-C01','bad');",'23503')
        reject('cross-program condition rejected',"INSERT INTO action_condition VALUES ('scheme:G031','G031-A01','G002-C01','bad');",'23503')
        reject('cross-program source rejected',"INSERT INTO condition_source VALUES ('scheme:G031','G031-C01','W02-S01');",'23503')
        reject('duplicate action-condition rejected',"INSERT INTO action_condition SELECT * FROM action_condition LIMIT 1;",'23505')
        reject('unknown common group rejected',"INSERT INTO group_condition VALUES ('missing','scheme:G031','G031-C01');",'23503')
        reject('unknown place rejected',"UPDATE action_place SET place_id='missing' WHERE program_key='district:W02' AND place_id='W02:office';",'23503')
        reject('wrong place source rejected',"UPDATE action_place SET source_id='S02-S01' WHERE program_key='district:W02';",'23503')
        result['counts']=fetch("SELECT jsonb_build_object('programs',(SELECT count(*) FROM catalog_program),'actions',(SELECT count(*) FROM catalog_action),'conditions',(SELECT count(*) FROM catalog_condition),'action_condition_links',(SELECT count(*) FROM action_condition),'sources',(SELECT count(*) FROM catalog_source),'condition_source_links',(SELECT count(*) FROM condition_source),'common_groups',(SELECT count(*) FROM common_group),'group_condition_links',(SELECT count(*) FROM group_condition),'districts',(SELECT count(*) FROM district),'sample_places',(SELECT count(*) FROM place));")
        result['query_examples']={key:outputs[key] for key in ['scheme:G031/G031-A01','scheme:G031/G031-A02','scheme:SEOUL-EM-GREEN-2026/SEOUL-EM-GREEN-2026-A07','district:W02/candidate:W02']}
        if addon is not None:
            result['scope']='existing catalog mapping plus additive user storage checks'
            result['user_storage']=addon(sql,fetch)
        result['status']='passed'
    except Exception as e:
        result['status']='failed';result['error']=repr(e)
    finally:
        if owned:
            removal=cmd(['docker','rm','-f',owned],check=False)
            residue=cmd(['docker','ps','-a','--no-trunc','--filter','id='+owned,'--format','{{.ID}}'],check=False)
            result['cleanup']={'removal_exit':removal.returncode,'container_absent':residue.returncode==0 and not residue.stdout.strip()}
            result['containers_after']=cmd(['docker','ps','--format','{{.ID}} {{.Names}}']).stdout.splitlines()
            result['baseline_containers_preserved']=set(result['containers_before']).issubset(set(result['containers_after']))
            if not result['cleanup']['container_absent']:result['status']='failed'
        result['file_sha256']={name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ['run_lookup.py','lookup-schema.sql','catalog.py','action_links.json']}
        result['finished_at']=datetime.now(timezone.utc).isoformat()
        (REPORT_DIR/report_name).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:result.get(k) for k in ['status','counts','error','cleanup']},ensure_ascii=False))
    return result['status']=='passed'

if __name__=='__main__': raise SystemExit(0 if run() else 1)
