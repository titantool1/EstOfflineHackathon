"""Rebuild the verified catalog, add the accepted basic user schema, then test it.

No app DB, authentication session, model call, or real user data is used.
"""
import hashlib
import json
from pathlib import Path
import run_lookup

HERE=Path(__file__).resolve().parent
A='00000000-0000-4000-8000-000000000001'
B='00000000-0000-4000-8000-000000000002'
EMPTY='00000000-0000-4000-8000-000000000003'
AT='2026-09-17T12:00:00+09:00'
Q=run_lookup.literal


def user_checks(sql,fetch):
    report={'status':'running','data_kind':'synthetic_only','tests':[],
            'limits':['fixture auth UUIDs, not production auth integration',
                      'test-prefixed region IDs, not official region-code import',
                      'current facts only; no historical reconstruction',
                      'no overall eligibility or conversational extraction test']}
    try:
        draft=json.loads((HERE/'user-input-schema.json').read_text())
        bootstrap="""
        CREATE TABLE users(id uuid PRIMARY KEY);
        CREATE TABLE services(service_code text PRIMARY KEY,title text NOT NULL);
        CREATE TABLE regions(
         region_id text PRIMARY KEY,name text NOT NULL,level integer NOT NULL CHECK(level BETWEEN 1 AND 3),
         parent_id text,parent_level integer GENERATED ALWAYS AS(level-1) STORED,
         UNIQUE(region_id,level),
         FOREIGN KEY(parent_id,parent_level) REFERENCES regions(region_id,level),
         CHECK((level=1 AND parent_id IS NULL) OR (level>1 AND parent_id IS NOT NULL)));
        INSERT INTO regions(region_id,name,level,parent_id) VALUES
         ('test:seoul','서울특별시',1,NULL),('test:nowon','노원구',2,'test:seoul'),
         ('test:dobong','도봉구',2,'test:seoul'),('test:seocho','서초구',2,'test:seoul'),
         ('test:dobong-dong','시험용 도봉 하위 지역',3,'test:dobong');
        """
        for user in [A,B,EMPTY]:bootstrap+=f'INSERT INTO users VALUES ({Q(user)});'
        for code,title in draft['service_codes'].items():bootstrap+=f'INSERT INTO services VALUES ({Q(code)},{Q(title)});'
        sql('BEGIN;'+bootstrap+(HERE/'user-storage.sql').read_text()+'COMMIT;')
        kinds={'user_profiles':'profile','user_regions':'region','user_memberships':'membership'}
        inserts=[]
        for key,spec in draft['input_definitions'].items():
            inserts.append(f'INSERT INTO user_input_definitions VALUES ({Q(key)},{Q(kinds[spec["table"]])});')
        for binding in draft['representative_condition_inputs']:
            source=kinds[draft['input_definitions'][binding['input_key']]['table']]
            for action in binding['action_ids']:
                values=[binding['program_key'],action,binding['condition_id'],binding['input_key'],source,
                        binding['selector'].get('relation'),binding['selector'].get('service_code')]
                inserts.append('INSERT INTO benefit_condition_inputs(program_key,action_id,condition_id,input_key,source_kind,relation,service_code) VALUES ('+','.join(Q(x) for x in values)+');')
        sql('BEGIN;'+''.join(inserts)+'COMMIT;')

        def check(name,actual,expected=True):
            ok=actual==expected
            report['tests'].append({'name':name,'passed':ok,'actual':actual,'expected':expected})
            if not ok:raise AssertionError(name)
        def reject(name,statement,code):
            p=sql('BEGIN;'+statement+'ROLLBACK;',False)
            check(name,p.returncode!=0 and code in p.stderr)
            report['tests'][-1]['sqlstate']=code
        def context(pk,aid,user=A):
            return fetch(f"SELECT COALESCE(user_benefit_context({Q(user)},{Q(pk)},{Q(aid)}),'null'::jsonb);")
        def eco(user=A):return context('scheme:SEOUL-EM-BLDG-2026','SEOUL-EM-BLDG-2026-A01',user)
        def member(code,value,user=A,at=AT):
            flag='true' if value else 'false'
            sql(f"INSERT INTO user_memberships VALUES ({Q(user)},{Q(code)},{flag},{Q(at)},'user_statement') ON CONFLICT (user_id,service_code) DO UPDATE SET is_member=excluded.is_member,observed_at=excluded.observed_at,source_kind=excluded.source_kind WHERE user_memberships.observed_at<=excluded.observed_at;")
        def region(rel,rid,user=A):sql(f"INSERT INTO user_regions VALUES ({Q(user)},{Q(rel)},{Q(rid)},{Q(AT)},'user_statement');")
        def fact(ctx,key,**selector):
            return next(i['user_fact'] for i in ctx['inputs'] if i['input_key']==key and i['selector']==selector)
        check('new user membership unknown, not false',eco()['inputs'][0]['user_fact'],None)
        check('new user known flag false',eco()['inputs'][0]['known'],False)
        member('eco_mileage',True);member('carbon_green',False);member('eco_mileage',False,B)
        member('dobong_carbon',True)
        one=eco();two=context('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A07')
        check('one membership row reused across two benefits',one['inputs'][0]['user_fact'],two['inputs'][0]['user_fact'])
        check('stored true survives round trip',one['inputs'][0]['user_fact']['value'],True)
        carbon=context('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A01')
        check('other service false remains known false',[carbon['inputs'][0]['known'],carbon['inputs'][0]['user_fact']['value']],[True,False])
        check('user B does not inherit A membership',eco(B)['inputs'][0]['user_fact']['value'],False)
        check('empty user does not inherit another user',eco(EMPTY)['inputs'][0]['user_fact'],None)
        check('only requested service read',[i['selector'] for i in one['inputs']],[{'service_code':'eco_mileage'}])
        check('membership facts retain provenance',one['inputs'][0]['user_fact']['source_kind'],'user_statement')
        member('eco_mileage',False,at='2026-09-18T12:00:00+09:00')
        check('correction updates shared membership',eco()['inputs'][0]['user_fact']['value'],False)
        check('correction visible from second benefit',context('scheme:SEOUL-EM-GREEN-2026','SEOUL-EM-GREEN-2026-A07')['inputs'][0]['user_fact']['value'],False)
        member('eco_mileage',True,at=AT)
        check('older upsert does not overwrite newer correction',eco()['inputs'][0]['user_fact']['value'],False)
        check('membership correction does not touch carbon',context('scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A01')['inputs'][0]['user_fact']['value'],False)
        sql(f"DELETE FROM user_memberships WHERE user_id={Q(A)} AND service_code='eco_mileage';")
        check('forgetting one membership returns unknown',eco()['inputs'][0]['user_fact'],None)
        check('forgetting A does not delete B record',eco(B)['inputs'][0]['user_fact']['value'],False)
        member('eco_mileage',True)
        check('school challenge has no inherited individual membership',context('scheme:G002','G002-A02')['inputs'],[])
        check('unanswered climate service stays unknown',context('scheme:G002','G002-A01')['inputs'][0]['user_fact'],None)
        check('known membership never produces eligibility',eco()['eligibility_status'],'not_evaluated')
        check('new-signup event is not inferred from eco membership',context('district:S11','candidate:S11')['inputs'],[])
        check('unmapped conditions remain explicit','S11-C02' in context('district:S11','candidate:S11')['conditions_without_user_binding'])

        sql(f"INSERT INTO user_profiles VALUES ({Q(A)},'2000-02-29',{Q(AT)},'user_statement'),({Q(B)},'2010-01-01',{Q(AT)},'user_statement');")
        kpass=context('scheme:G003','G003-A01')
        check('birth date stored exactly',fact(kpass,'person.birth_date')['value'],'2000-02-29')
        check('unanswered residence remains unknown',fact(kpass,'location.region_ids',relation='registered_residence'),None)
        check('DOB of another user isolated',fact(context('scheme:G003','G003-A01',B),'person.birth_date')['value'],'2010-01-01')
        sql(f"UPDATE user_profiles SET birth_date='1999-03-01',observed_at={Q(AT)} WHERE user_id={Q(A)};")
        check('DOB corrected without duplicate age field',fact(context('scheme:G003','G003-A01'),'person.birth_date')['value'],'1999-03-01')
        check('birth date not fetched for membership-only benefit',all(i['input_key']!='person.birth_date' for i in eco()['inputs']))
        sql(f"UPDATE user_profiles SET birth_date=NULL,observed_at=NULL,source_kind=NULL WHERE user_id={Q(A)};")
        check('cleared birth date becomes unknown',fact(context('scheme:G003','G003-A01'),'person.birth_date'),None)

        region('registered_residence','test:nowon');region('work','test:dobong-dong');region('work','test:nowon')
        region('study','test:seoul');region('business','test:seocho');region('registered_residence','test:seocho',B)
        dobong=context('district:W01','candidate:W01')
        check('residence distinct from living area',fact(dobong,'location.region_ids',relation='registered_residence')['value'],['test:nowon'])
        check('multiple work regions preserved',fact(dobong,'location.region_ids',relation='work')['value'],['test:dobong-dong','test:nowon'])
        check('study relation independent',fact(dobong,'location.region_ids',relation='study')['value'],['test:seoul'])
        check('region ancestors resolvable without duplicate user rows',fetch("WITH RECURSIVE ancestors AS (SELECT region_id,parent_id,level FROM regions WHERE region_id='test:dobong-dong' UNION ALL SELECT r.region_id,r.parent_id,r.level FROM regions r JOIN ancestors a ON r.region_id=a.parent_id) SELECT jsonb_agg(region_id ORDER BY level) FROM ancestors;"),['test:seoul','test:dobong','test:dobong-dong'])
        check('Seocho input excludes student relation',all(i['selector'].get('relation')!='study' for i in context('district:S07','candidate:S07')['inputs']))
        member('seocho_coin',True)
        check('Seocho membership independent',fact(context('district:S07','candidate:S07'),'membership.is_member',service_code='seocho_coin')['value'],True)
        check('Dobong membership preserved',fact(context('district:W01','candidate:W01'),'membership.is_member',service_code='dobong_carbon')['value'],True)
        sql(f"BEGIN; DELETE FROM user_regions WHERE user_id={Q(A)} AND relation='registered_residence'; INSERT INTO user_regions VALUES ({Q(A)},'registered_residence','test:seocho',{Q(AT)},'user_statement'); COMMIT;")
        after=context('district:W01','candidate:W01')
        check('residence replacement changes only residence',fact(after,'location.region_ids',relation='registered_residence')['value'],['test:seocho'])
        check('residence replacement preserves all work regions',fact(after,'location.region_ids',relation='work'),fact(dobong,'location.region_ids',relation='work'))
        check('B residence remains unchanged',fact(context('scheme:G003','G003-A01',B),'location.region_ids',relation='registered_residence')['value'],['test:seocho'])
        reject('invalid replacement rolls back deletion',f"DELETE FROM user_regions WHERE user_id={Q(A)} AND relation='registered_residence'; INSERT INTO user_regions VALUES ({Q(A)},'registered_residence','missing',{Q(AT)},'user_statement');",'23503')
        check('residence still present after failed replacement',fact(context('district:W01','candidate:W01'),'location.region_ids',relation='registered_residence')['value'],['test:seocho'])

        reject('duplicate residence rejected',f"INSERT INTO user_regions VALUES ({Q(A)},'registered_residence','test:nowon',{Q(AT)},'user_statement');",'23505')
        reject('duplicate service membership rejected',f"INSERT INTO user_memberships VALUES ({Q(A)},'eco_mileage',true,{Q(AT)},'user_statement');",'23505')
        reject('unknown membership service rejected',f"INSERT INTO user_memberships VALUES ({Q(A)},'missing',true,{Q(AT)},'user_statement');",'23503')
        reject('null is not explicit false',f"INSERT INTO user_memberships VALUES ({Q(A)},'climate_action_15',NULL,{Q(AT)},'user_statement');",'23502')
        reject('invalid boolean rejected',f"UPDATE user_memberships SET is_member='maybe' WHERE user_id={Q(A)};",'22P02')
        reject('unknown user fact rejected',f"INSERT INTO user_profiles VALUES ('00000000-0000-4000-8000-000000000099','2000-01-01',{Q(AT)},'user_statement');",'23503')
        reject('DOB missing provenance rejected',f"UPDATE user_profiles SET birth_date='2000-01-01' WHERE user_id={Q(A)};",'23514')
        reject('birth date after observation rejected',f"UPDATE user_profiles SET birth_date='2027-01-01',observed_at={Q(AT)},source_kind='user_statement' WHERE user_id={Q(A)};",'23514')
        reject('unsupported region relation rejected',f"INSERT INTO user_regions VALUES ({Q(A)},'gps','test:nowon',{Q(AT)},'user_statement');",'23514')
        reject('cyclic region parent rejected by parent level',"UPDATE regions SET parent_id='test:dobong-dong' WHERE region_id='test:dobong';",'23503')
        reject('cross-program condition input rejected',"INSERT INTO benefit_condition_inputs(program_key,action_id,condition_id,input_key,source_kind,service_code) VALUES ('scheme:G003','G003-A01','W01-C02','membership.is_member','membership','eco_mileage');",'23503')
        reject('unknown input key rejected',"UPDATE benefit_condition_inputs SET input_key='missing' WHERE program_key='scheme:G003';",'23503')
        reject('membership selector cannot be used as region selector',"UPDATE benefit_condition_inputs SET relation='work' WHERE program_key='scheme:G002';",'23514')
        check('nonexistent benefit remains absent',context('scheme:G003','missing'),None)
        reject('unknown lookup user rejected',"SELECT user_benefit_context('00000000-0000-4000-8000-000000000099','scheme:G003','G003-A01');",'22023')
        check('place lookup does not invent residency input',context('district:W02','candidate:W02')['inputs'],[])
        check('original condition and source still returned',context('scheme:G003','G003-A01')['conditions'][0]['sources'][0]['id'],'G003-S02')
        report['counts']=fetch("SELECT jsonb_build_object('user_tables',3,'test_users',(SELECT count(*) FROM users),'service_codes',(SELECT count(*) FROM services),'input_definitions',(SELECT count(*) FROM user_input_definitions),'expanded_condition_inputs',(SELECT count(*) FROM benefit_condition_inputs));")
        report['examples']={'eco':eco(),'dobong':context('district:W01','candidate:W01'),'kpass':context('scheme:G003','G003-A01')}
        report['status']='passed'
        return report
    except Exception as error:
        report['status']='failed';report['error']=repr(error)
        raise
    finally:
        report['file_sha256']={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in ['user-storage.sql','test_user_storage.py','user-input-schema.json']}
        (run_lookup.REPORT_DIR/'user-storage-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    raise SystemExit(0 if run_lookup.run(addon=user_checks,report_name='user-storage-result.json') else 1)
