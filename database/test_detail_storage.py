"""Add agreed detail domains to the existing verified DB; synthetic data only."""
import hashlib
import json
from pathlib import Path
import run_lookup
import test_user_storage
from detail_mapping import DEFINITIONS,WELFARE_TYPES,bindings

HERE=Path(__file__).resolve().parent
A,B,EMPTY=test_user_storage.A,test_user_storage.B,test_user_storage.EMPTY
AT=test_user_storage.AT
Q=run_lookup.literal
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
H,H2,HB=uid(100),uid(101),uid(102)
SELF,YOUNG,OLD,OTHER,BMEM=uid(200),uid(201),uid(202),uid(203),uid(204)
HOME1,HOME2,HOMEB=uid(300),uid(301),uid(302)
CAR1,CAR2,CARB=uid(400),uid(401),uid(402)

def detail_checks(sql,fetch):
 report={'status':'running','tests':[],'scope':'detail schema + current-fact lookup, not eligibility',
         'data_kind':'synthetic','reference_commit':'24f474448eafc45e72249581b84f0b530657cdce'}
 try:
  sql('BEGIN;'+(HERE/'detail-storage.sql').read_text()+'COMMIT;')
  def insert(table,columns,*values):
   # Quote SQL data as literals; booleans arrive as explicit PostgreSQL literals in strings.
   sql(f'INSERT INTO {table}({columns}) VALUES ('+','.join(Q(v) for v in values)+');')
  for code,title in WELFARE_TYPES.items():insert('welfare_types','welfare_code,title',code,title)
  defs={row[0]:row for row in DEFINITIONS}
  for row in DEFINITIONS:insert('detail_input_definitions','input_key,domain,field_name,value_type',*row)
  actions={(r['program_key'],r['condition_id']):r['action_ids'] for r in json.loads((HERE/'action_links.json').read_text())}
  rows=bindings()
  for r in rows:
   for action in actions[r['program_key'],r['condition_id']]:
    insert('detail_condition_inputs','program_key,action_id,condition_id,input_key,domain,subject_scope,welfare_code',
     r['program_key'],action,r['condition_id'],r['input_key'],defs[r['input_key']][1],r['subject_scope'],r['welfare_code'])
  def check(name,actual,expected=True):
   ok=actual==expected;report['tests'].append({'name':name,'passed':ok,'actual':actual,'expected':expected})
   if not ok:raise AssertionError(name)
  def reject(name,statement,code):
   p=sql('BEGIN;'+statement+'ROLLBACK;',False);check(name,p.returncode!=0 and code in p.stderr)
   report['tests'][-1]['sqlstate']=code
  def ctx(pid='G031',action='A01',user=A,hh=None,home=None,car=None):
   return fetch('SELECT COALESCE(user_detail_context('+','.join(Q(v) for v in [user,'scheme:'+pid,pid+'-'+action,hh,home,car])+"),'null'::jsonb);")
  def item(c,key,code=None):
   return next(i for i in c['inputs'] if i['input_key']==key and i['selector'].get('welfare_code')==code)
  def mvalue(c,key,member,code=None):
   f=item(c,key,code)['user_fact'];return next(m['fact'] for m in f['members'] if m['member_id']==member)
  check('unselected household does not combine user records',item(ctx(),'member.birth_date')['selection_status'],'not_selected')
  for u,h,complete in [(A,H,'true'),(A,H2,'false'),(B,HB,'true')]:
   insert('user_households','user_id,household_id,members_complete,observed_at,source_kind',u,h,complete,AT,'user_statement')
  member_cols='user_id,household_id,member_id,relation_to_applicant,on_resident_register,birth_date,preschool,registered_disability,observed_at,source_kind'
  for row in [(A,H,SELF,'self','true',None,None,'false'),
              (A,H,YOUNG,'child','true','2020-03-01','false','false'),
              (A,H,OLD,'other','true','2000-01-01','true',None),
              (A,H2,OTHER,'parent','true','1950-01-01',None,'true'),
              (B,HB,BMEM,'self','true',None,None,'true')]:
   insert('household_members',member_cols,*row,AT,'user_statement')
  sql(f"UPDATE user_profiles SET birth_date='1990-01-01',observed_at={Q(AT)},source_kind='user_statement' WHERE user_id={Q(A)};")
  def welfare(u,scope,code,value,hh=None,member=None):
   insert('user_welfare_statuses','user_id,subject_scope,household_id,member_id,welfare_code,has_status,observed_at,source_kind',u,scope,hh,member,code,value,AT,'user_statement')
  welfare(A,'self','housing_benefit','true');welfare(A,'self','medical_benefit','false')
  welfare(A,'member','education_benefit','true',H,YOUNG)
  welfare(A,'member','housing_benefit','true',H2,OTHER)
  welfare(B,'self','housing_benefit','false')
  energy=ctx(hh=H)
  check('only selected household members returned',[m['member_id'] for m in item(energy,'member.birth_date')['user_fact']['members']],[SELF,YOUNG,OLD])
  check('applicant birth date reused from basic profile',mvalue(energy,'member.birth_date',SELF)['value'],'1990-01-01')
  check('applicant welfare reused from self record',mvalue(energy,'welfare.has_status',SELF,'housing_benefit')['value'],True)
  check('member welfare linked to that member',mvalue(energy,'welfare.has_status',YOUNG,'education_benefit')['value'],True)
  check('missing different-member welfare remains unknown',mvalue(energy,'welfare.has_status',OLD,'education_benefit'),None)
  check('explicit false welfare preserved',mvalue(energy,'welfare.has_status',SELF,'medical_benefit')['value'],False)
  check('missing member disability remains unknown',mvalue(energy,'member.registered_disability',OLD),None)
  check('known member disability false preserved',mvalue(energy,'member.registered_disability',YOUNG)['value'],False)
  check('other household disability never leaks',OTHER not in [m['member_id'] for m in item(energy,'member.registered_disability')['user_fact']['members']])
  check('same user different household selected explicitly',mvalue(ctx(hh=H2),'member.registered_disability',OTHER)['value'],True)
  check('partial member list kept explicit',item(ctx(hh=H2),'member.birth_date')['user_fact']['members_complete'],False)
  check('other user welfare kept separate',mvalue(ctx(user=B,hh=HB),'welfare.has_status',BMEM,'housing_benefit')['value'],False)
  # A deliberately split age/preschool example must not satisfy a same-member conjunction.
  check('same-member SQL conjunction does not mix two people',fetch(f"SELECT count(*) FROM household_members WHERE user_id={Q(A)} AND household_id={Q(H)} AND birth_date>'2019-01-01' AND preschool IS TRUE;"),0)
  dates={m['member_id']:m['fact'] for m in item(energy,'member.birth_date')['user_fact']['members']}
  preschool={m['member_id']:m['fact'] for m in item(energy,'member.preschool')['user_fact']['members']}
  check('returned object can preserve same-member conjunction',any(d and d['value']>'2019-01-01' and preschool[k] and preschool[k]['value'] for k,d in dates.items()),False)
  sql(f"UPDATE household_members SET preschool=true WHERE user_id={Q(A)} AND household_id={Q(H)} AND member_id={Q(YOUNG)};")
  check('one member correction visible',mvalue(ctx(hh=H),'member.preschool',YOUNG)['value'],True)
  sql(f"UPDATE user_welfare_statuses SET has_status=false WHERE user_id={Q(A)} AND subject_scope='self' AND welfare_code='housing_benefit';")
  check('self welfare correction visible in household projection',mvalue(ctx(hh=H),'welfare.has_status',SELF,'housing_benefit')['value'],False)
  check('self welfare correction does not change other member',mvalue(ctx(hh=H2),'welfare.has_status',OTHER,'housing_benefit')['value'],True)
  sql(f"DELETE FROM user_welfare_statuses WHERE user_id={Q(A)} AND subject_scope='member' AND member_id={Q(YOUNG)} AND welfare_code='education_benefit';")
  check('deleted member welfare becomes unknown',mvalue(ctx(hh=H),'welfare.has_status',YOUNG,'education_benefit'),None)
  check('no automatic eligibility from detailed values',energy['eligibility_status'],'not_evaluated')
  check('coal variant does not inherit preschool input',all(i['input_key']!='member.preschool' for i in ctx(action='A02',hh=H)['inputs']))
  check('self welfare can be read without household selection',item(ctx('G027'),'welfare.has_status','housing_benefit')['user_fact']['value'],False)

  for row in [(A,HOME1,'test:nowon','apartment','residential','2010-01-01'),
              (A,HOME2,'test:seocho','non_residential','general',None),
              (B,HOMEB,'test:dobong','detached','industrial','2000-01-01')]:
   insert('user_homes','user_id,home_id,region_id,dwelling_type,electricity_contract_kind,building_approval_date,observed_at,source_kind',*row,AT,'user_statement')
  check('multiple homes require explicit selection',item(ctx('G021'),'home.electricity_contract_kind')['selection_status'],'not_selected')
  check('selected first home contract',item(ctx('G021',home=HOME1),'home.electricity_contract_kind')['user_fact']['value'],'residential')
  check('selected second home contract distinct',item(ctx('G021',home=HOME2),'home.electricity_contract_kind')['user_fact']['value'],'general')
  check('home missing approval date unknown',item(ctx('G027',home=HOME2),'home.building_approval_date')['user_fact'],None)
  check('home date exact',item(ctx('G027',home=HOME1),'home.building_approval_date')['user_fact']['value'],'2010-01-01')
  check('regional match does not become exact-address proof','G021-C03' in ctx('G021',home=HOME1)['conditions_without_user_binding'])
  sql(f"UPDATE user_homes SET electricity_contract_kind='general' WHERE user_id={Q(A)} AND home_id={Q(HOME1)};")
  check('home correction visible',item(ctx('G021',home=HOME1),'home.electricity_contract_kind')['user_fact']['value'],'general')
  check('home correction does not affect other user',item(ctx('G021',user=B,home=HOMEB),'home.electricity_contract_kind')['user_fact']['value'],'industrial')
  for row in [(A,CAR1,'test:seoul','passenger_car','gasoline','private',5),
              (A,CAR2,'test:nowon','van','electric','commercial',9),
              (B,CARB,'test:seocho','truck','diesel','commercial',2)]:
   insert('user_vehicles','user_id,vehicle_id,registered_region_id,vehicle_kind,fuel_kind,usage_kind,seating_capacity,observed_at,source_kind',*row,AT,'user_statement')
  carpid='SEOUL-EM-CAR-2026'
  check('multiple vehicles not combined without selection',item(ctx(carpid),'vehicle.fuel_kind')['selection_status'],'not_selected')
  car=ctx(carpid,car=CAR1)
  check('all requested vehicle facts refer to same vehicle',{i['user_fact']['entity_id'] for i in car['inputs'] if i['input_key'].startswith('vehicle.') }=={CAR1})
  check('vehicle capacity stored as number',item(car,'vehicle.seating_capacity')['user_fact']['value'],5)
  check('vehicle type and fuel preserved',item(ctx(carpid,car=CAR2),'vehicle.fuel_kind')['user_fact']['value'],'electric')
  sql(f"UPDATE user_vehicles SET fuel_kind='hybrid' WHERE user_id={Q(A)} AND vehicle_id={Q(CAR1)};")
  check('vehicle correction visible',item(ctx(carpid,car=CAR1),'vehicle.fuel_kind')['user_fact']['value'],'hybrid')
  check('vehicle correction does not alter other vehicle',item(ctx(carpid,car=CAR2),'vehicle.fuel_kind')['user_fact']['value'],'electric')
  check('no vehicle facts fetched for home benefit',all(not i['input_key'].startswith('vehicle.') for i in ctx('G021',home=HOME1)['inputs']))
  check('no all-member facts fetched for home benefit',all(not i['input_key'].startswith('member.') for i in ctx('G021',home=HOME1)['inputs']))
  check('base membership lookup remains unchanged',fetch(f"SELECT user_benefit_context({Q(A)},'scheme:SEOUL-EM-BLDG-2026','SEOUL-EM-BLDG-2026-A01')->'inputs'->0->'user_fact'->'value';"),True)

  reject('cross-user household relation rejected',f"INSERT INTO household_members(user_id,household_id,member_id,relation_to_applicant,observed_at,source_kind) VALUES ({Q(A)},{Q(HB)},{Q(uid(299))},'child',{Q(AT)},'user_statement');",'23503')
  reject('self DOB cannot duplicate profile',f"UPDATE household_members SET birth_date='1991-01-01' WHERE user_id={Q(A)} AND member_id={Q(SELF)};",'23514')
  reject('second current self member rejected',f"INSERT INTO household_members(user_id,household_id,member_id,relation_to_applicant,observed_at,source_kind) VALUES ({Q(A)},{Q(H2)},{Q(uid(299))},'self',{Q(AT)},'user_statement');",'23505')
  reject('self welfare cannot be duplicated as member welfare',f"INSERT INTO user_welfare_statuses(user_id,subject_scope,household_id,member_id,welfare_code,has_status,observed_at,source_kind) VALUES ({Q(A)},'member',{Q(H)},{Q(SELF)},'medical_benefit',true,{Q(AT)},'user_statement');",'23503')
  reject('unknown welfare code rejected',f"UPDATE user_welfare_statuses SET welfare_code='unrecognized' WHERE user_id={Q(A)} AND subject_scope='self' AND welfare_code='housing_benefit';",'23503')
  reject('duplicate self welfare rejected',f"INSERT INTO user_welfare_statuses(user_id,subject_scope,welfare_code,has_status,observed_at,source_kind) VALUES ({Q(A)},'self','housing_benefit',true,{Q(AT)},'user_statement');",'23505')
  reject('welfare null is not false',f"UPDATE user_welfare_statuses SET has_status=NULL WHERE user_id={Q(A)};",'23502')
  reject('wrong household member welfare rejected',f"INSERT INTO user_welfare_statuses(user_id,subject_scope,household_id,member_id,welfare_code,has_status,observed_at,source_kind) VALUES ({Q(A)},'member',{Q(H2)},{Q(YOUNG)},'medical_benefit',true,{Q(AT)},'user_statement');",'23503')
  reject('other user household selection rejected',f"SELECT user_detail_context({Q(A)},'scheme:G031','G031-A01',{Q(HB)},NULL,NULL);",'22023')
  reject('other user home selection rejected',f"SELECT user_detail_context({Q(A)},'scheme:G021','G021-A01',NULL,{Q(HOMEB)},NULL);",'22023')
  reject('other user vehicle selection rejected',f"SELECT user_detail_context({Q(A)},'scheme:{carpid}','{carpid}-A01',NULL,NULL,{Q(CARB)});",'22023')
  reject('invalid home enum rejected',f"UPDATE user_homes SET electricity_contract_kind='qualified' WHERE user_id={Q(A)};",'23514')
  reject('nonpositive vehicle seats rejected',f"UPDATE user_vehicles SET seating_capacity=0 WHERE user_id={Q(A)};",'23514')
  reject('unknown vehicle region rejected',f"UPDATE user_vehicles SET registered_region_id='missing' WHERE user_id={Q(A)};",'23503')
  reject('unknown detail field rejected',"INSERT INTO detail_input_definitions VALUES ('bad','home','is_eligible','boolean');",'23514')
  reject('cross-domain input selector rejected',"UPDATE detail_condition_inputs SET subject_scope='home' WHERE domain='vehicle';",'23514')
  reject('deleting referenced household rejected',f"DELETE FROM user_households WHERE user_id={Q(A)} AND household_id={Q(H)};",'23503')
  report['counts']=fetch("SELECT jsonb_build_object('detail_user_tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('user_households','household_members','user_welfare_statuses','user_homes','user_vehicles')),'definitions',(SELECT count(*) FROM detail_input_definitions),'expanded_bindings',(SELECT count(*) FROM detail_condition_inputs),'source_conditions',(SELECT count(DISTINCT (program_key,condition_id)) FROM detail_condition_inputs));")
  report['mapping']=rows
  report['examples']={'household':ctx(hh=H),'home':ctx('G021',home=HOME1),'vehicle':ctx(carpid,car=CAR1)}
  report['status']='passed'
  return report
 except Exception as error:
  report['status']='failed';report['error']=repr(error);raise
 finally:
  report['file_sha256']={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in ['detail-storage.sql','detail_mapping.py','test_detail_storage.py']}
  (run_lookup.REPORT_DIR/'detail-storage-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')

def addon(sql,fetch):
 return {'basic':test_user_storage.user_checks(sql,fetch),'detail':detail_checks(sql,fetch)}

if __name__=='__main__':
 raise SystemExit(0 if run_lookup.run(addon=addon,report_name='detail-storage-result.json') else 1)
