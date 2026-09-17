"""Representative input dependencies, not full eligibility rules."""
WELFARE_TYPES={
 'livelihood_benefit':'생계급여','medical_benefit':'의료급여',
 'housing_benefit':'주거급여','education_benefit':'교육급여',
 'near_low_income':'차상위계층','statutory_single_parent':'법정 한부모가족',
 'veteran':'국가유공 자격',
}
DEFINITIONS=[
 ('welfare.has_status','welfare','has_status','boolean'),
 ('member.birth_date','member','birth_date','date'),
 ('member.preschool','member','preschool','boolean'),
 ('member.registered_disability','member','registered_disability','boolean'),
 ('member.on_resident_register','member','on_resident_register','boolean'),
 ('member.relation_to_applicant','member','relation_to_applicant','text'),
 ('home.region_id','home','region_id','text'),
 ('home.dwelling_type','home','dwelling_type','text'),
 ('home.electricity_contract_kind','home','electricity_contract_kind','text'),
 ('home.building_approval_date','home','building_approval_date','date'),
 ('vehicle.registered_region_id','vehicle','registered_region_id','text'),
 ('vehicle.vehicle_kind','vehicle','vehicle_kind','text'),
 ('vehicle.fuel_kind','vehicle','fuel_kind','text'),
 ('vehicle.usage_kind','vehicle','usage_kind','text'),
 ('vehicle.seating_capacity','vehicle','seating_capacity','integer'),
]

def bindings():
    rows=[]
    def add(pid,cid,key,scope,code=None):
        rows.append({'program_key':'scheme:'+pid,'condition_id':pid+'-'+cid,
                     'input_key':key,'subject_scope':scope,'welfare_code':code,
                     'mapping_scope':'partial_input_dependency_not_eligibility'})
    for code in ['livelihood_benefit','medical_benefit','housing_benefit','education_benefit']:
        add('G031','C01','welfare.has_status','household',code)
        add('G031','C13','welfare.has_status','household',code)
        add('G027','C03','welfare.has_status','self',code)
    add('G027','C03','welfare.has_status','self','near_low_income')
    add('G031','C14','welfare.has_status','household','near_low_income')
    for cid in ['C02','C05','C11','C15']:
        add('G031',cid,'member.birth_date','household')
        add('G031',cid,'member.on_resident_register','household')
    add('G031','C05','member.preschool','household')
    add('G031','C11','member.relation_to_applicant','household')
    for cid in ['C06','C16']:
        add('G031',cid,'member.registered_disability','household')
        add('G031',cid,'member.on_resident_register','household')
    for cid in ['C09','C17']:
        add('G031',cid,'welfare.has_status','household','statutory_single_parent')
    add('G027','C09','welfare.has_status','self','veteran')
    add('G021','C01','home.electricity_contract_kind','home')
    add('G027','C01','home.building_approval_date','home')
    add('G027','C02','home.dwelling_type','home')
    # G021-C03 is an exact-address/request relation, not equivalent to a region ID.
    for field in ['registered_region_id','vehicle_kind','fuel_kind','usage_kind','seating_capacity']:
        add('SEOUL-EM-CAR-2026','C01','vehicle.'+field,'vehicle')
    return rows
