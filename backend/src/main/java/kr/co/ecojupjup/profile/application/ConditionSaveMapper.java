package kr.co.ecojupjup.profile.application;

import java.util.*;
import kr.co.ecojupjup.profile.facts.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;
import tools.jackson.databind.node.ObjectNode;

/** Maps the public condition vocabulary onto the existing encrypted fact rows. */
@Component
public class ConditionSaveMapper {
    private static final Set<String> RELATIONS=Set.of("registered_residence","work","study","business");
    private static final Map<String,Set<String>> ENUMS=Map.of(
        "relation_to_applicant",Set.of("self","spouse","child","parent","other"),
        "dwelling_type",Set.of("apartment","detached","multi_family","non_residential","other"),
        "electricity_contract_kind",Set.of("residential","general","industrial","other"),
        "vehicle_kind",Set.of("passenger_car","van","truck","motorcycle","other"),
        "fuel_kind",Set.of("gasoline","diesel","lpg","electric","hydrogen","hybrid","other"),
        "usage_kind",Set.of("private","commercial","other"));
    private static final Map<String,String> MEMBER=Map.of("member.relation_to_applicant","relation_to_applicant","member.on_resident_register","on_resident_register","member.birth_date","birth_date","member.preschool","preschool","member.registered_disability","registered_disability");
    private static final Map<String,String> HOME=Map.of("home.region_id","region_id","home.dwelling_type","dwelling_type","home.electricity_contract_kind","electricity_contract_kind","home.building_approval_date","building_approval_date");
    private static final Map<String,String> VEHICLE=Map.of("vehicle.registered_region_id","registered_region_id","vehicle.vehicle_kind","vehicle_kind","vehicle.fuel_kind","fuel_kind","vehicle.usage_kind","usage_kind","vehicle.seating_capacity","seating_capacity");
    private final PrivateFactsStore facts; private final ObjectMapper json;
    public ConditionSaveMapper(PrivateFactsStore facts,ObjectMapper json){this.facts=facts;this.json=json;}

    public List<FactChange> map(UUID owner,List<ConditionSaveCommand.Change> requested){
        LinkedHashMap<FactKey,Planned> planned=new LinkedHashMap<>();
        for(var change:requested) mapOne(owner,change,planned);
        return planned.values().stream().map(p->new FactChange(p.key,p.patch,p.expected,p.delete)).toList();
    }
    private void mapOne(UUID owner,ConditionSaveCommand.Change c,Map<FactKey,Planned> out){
        var i=c.input(); var t=i.target();
        if("self".equals(t.kind())&&!owner.equals(t.id())) invalid();
        FactTable table; String field; StoredFact current=null; FactKey key;
        switch(i.inputKey()){
            case "person.birth_date" -> { exact(i,"date",Set.of(),"self");table=FactTable.PROFILE;field="birth_date";key=new FactKey(table,owner,null,null,null);current=owned(owner,key); }
            case "location.region_ids" -> { exact(i,"region_id_array",Set.of("relation"),"self"); String relation=i.selector().get("relation");if(!RELATIONS.contains(relation))invalid(); mapRegions(owner,c,relation,out);return; }
            case "membership.is_member" -> { exact(i,"boolean",Set.of("service_code"),"self"); table=FactTable.MEMBERSHIP;field="is_member";current=findBy(owner,table,"service_code",i.selector().get("service_code"));key=current==null?new FactKey(table,UUID.randomUUID(),null,null,null):current.key(); }
            case "household.members_complete" -> { exact(i,"boolean",Set.of(),"household");table=FactTable.HOUSEHOLD;field="members_complete";key=new FactKey(table,t.id(),null,null,null);current=owned(owner,key); }
            case "welfare.has_status" -> { exact(i,"boolean",Set.of("welfare_code"),Set.of("self","member")); String scope=t.kind(); UUID household="member".equals(scope)?t.householdId():null;UUID member="member".equals(scope)?t.id():null;if(member!=null)owned(owner,new FactKey(FactTable.MEMBER,member,household,null,null)); current=facts.listWelfare(owner,scope,household,member).stream().filter(f->i.selector().get("welfare_code").equals(f.values().path("welfare_code").asText())).findFirst().orElse(null);table=FactTable.WELFARE;field="has_status";key=current==null?new FactKey(table,UUID.randomUUID(),household,member,scope):current.key(); }
            default -> { Map<String,String> fields; if(MEMBER.containsKey(i.inputKey())){table=FactTable.MEMBER;fields=MEMBER;exact(i,typeFor(field=fields.get(i.inputKey())),Set.of(),"member");key=new FactKey(table,t.id(),t.householdId(),null,null);}
                else if(HOME.containsKey(i.inputKey())){table=FactTable.HOME;fields=HOME;field=fields.get(i.inputKey());exact(i,typeFor(field),Set.of(),"home");key=new FactKey(table,t.id(),null,null,null);}
                else if(VEHICLE.containsKey(i.inputKey())){table=FactTable.VEHICLE;fields=VEHICLE;field=fields.get(i.inputKey());exact(i,typeFor(field),Set.of(),"vehicle");key=new FactKey(table,t.id(),null,null,null);}
                else {invalid();return;} current=owned(owner,key); }
        }
        JsonNode now=current==null?null:current.values().get(field); checkBaseline(c.baseline(),now);
        boolean clear="clear".equals(c.operation().kind()); if(clear&&required(table,field))invalid(); if(!clear){validateValue(i.valueType(),c.operation().value());Set<String> allowed=ENUMS.get(field);if(allowed!=null&&!allowed.contains(c.operation().value().textValue()))invalid();}
        final StoredFact existing=current;
        Planned p=out.computeIfAbsent(key,k->new Planned(k,existing==null?0L:existing.revision(),json.createObjectNode()));
        p.patch.set(field,clear?json.nullNode():c.operation().value().deepCopy());
        if(table==FactTable.PROFILE&&field.equals("birth_date")){p.patch.set("observed_at",clear?json.nullNode():json.valueToTree(c.observation().observedAt()));p.patch.set("source_kind",clear?json.nullNode():json.valueToTree("user_statement"));}
        else if(!clear || table!=FactTable.PROFILE){p.patch.put("observed_at",c.observation().observedAt()).put("source_kind","user_statement");}
        if(current!=null&&current.revision()==0)p.expected=0L;
        if(current!=null&&current.values().isEmpty()&&table==FactTable.PROFILE&&!clear)p.expected=0L;
        if(current==null) addStructural(p.patch,table,i);
    }
    private void mapRegions(UUID owner,ConditionSaveCommand.Change c,String relation,Map<FactKey,Planned> out){
        List<StoredFact> rows=facts.list(owner,FactTable.REGION).stream().filter(f->relation.equals(f.values().path("relation").asText())).toList();
        List<String> current=rows.stream().map(f->f.values().path("region_id").asText()).sorted().toList();checkRegionBaseline(c.baseline(),current);
        List<String> wanted="clear".equals(c.operation().kind())?List.of():strings(c.operation().value()); Set<String> desired=new LinkedHashSet<>(wanted); if(desired.size()!=wanted.size())invalid();
        for(StoredFact row:rows)if(!desired.remove(row.values().path("region_id").asText()))out.put(row.key(),new Planned(row.key(),row.revision(),json.createObjectNode(),true));
        for(String id:desired){ObjectNode patch=json.createObjectNode().put("relation",relation).put("region_id",id).put("observed_at",c.observation().observedAt()).put("source_kind","user_statement");FactKey key=new FactKey(FactTable.REGION,UUID.randomUUID(),null,null,null);out.put(key,new Planned(key,0L,patch));}
    }
    private StoredFact findBy(UUID owner,FactTable table,String field,String value){return facts.list(owner,table).stream().filter(f->value.equals(f.values().path(field).asText())).findFirst().orElse(null);}
    private StoredFact owned(UUID owner,FactKey key){return facts.find(owner,key).orElseThrow(ConditionSaveMapper::invalidEx);}
    private static void checkRegionBaseline(ConditionSaveCommand.Baseline baseline,List<String> current){
        if("missing".equals(baseline.status())){if(!current.isEmpty())conflict();return;}
        List<String> expected=strings(baseline.value());if(new HashSet<>(expected).size()!=expected.size())invalid();
        if(!expected.stream().sorted().toList().equals(current))conflict();
    }
    private static void checkBaseline(ConditionSaveCommand.Baseline b,JsonNode now){boolean missing=now==null||now.isNull();if("missing".equals(b.status())){if(!missing)conflict();}else if(missing||!now.equals(b.value()))conflict();}
    private static boolean required(FactTable table,String field){return table==FactTable.MEMBERSHIP||table==FactTable.HOUSEHOLD||table==FactTable.WELFARE||(table==FactTable.MEMBER&&field.equals("relation_to_applicant"));}
    private static String typeFor(String field){return switch(field){case "on_resident_register","preschool","registered_disability"->"boolean";case "birth_date","building_approval_date"->"date";case "seating_capacity"->"integer";default->"text";};}
    private static void validateValue(String type,JsonNode n){if(n==null||switch(type){case "boolean"->!n.isBoolean();case "integer"->!n.isIntegralNumber()||!n.canConvertToInt()||n.intValue()<=0;case "number"->!n.isNumber();case "text","date"->!n.isTextual()||n.textValue().isBlank();default->true;})invalid();}
    private static List<String> strings(JsonNode n){if(n==null||!n.isArray())invalid();List<String> r=new ArrayList<>();n.forEach(v->{if(!v.isTextual()||v.textValue().isBlank())invalid();r.add(v.textValue());});return r;}
    private static void exact(ConditionSaveCommand.Input i,String type,Set<String> selectors,String kind){exact(i,type,selectors,Set.of(kind));}
    private static void exact(ConditionSaveCommand.Input i,String type,Set<String> selectors,Set<String> kinds){if(!type.equals(i.valueType())||!i.selector().keySet().equals(selectors)||!kinds.contains(i.target().kind())||("member".equals(i.target().kind())&&i.target().householdId()==null)||(!"member".equals(i.target().kind())&&i.target().householdId()!=null))invalid();}
    private static void addStructural(ObjectNode p,FactTable table,ConditionSaveCommand.Input i){if(table==FactTable.MEMBERSHIP)p.put("service_code",i.selector().get("service_code"));else if(table==FactTable.WELFARE)p.put("welfare_code",i.selector().get("welfare_code"));}
    private static InvalidChange invalidEx(){return new InvalidChange();} private static void invalid(){throw invalidEx();} private static void conflict(){throw new Conflict();}
    public static class Rejected extends RuntimeException {private final String reason; Rejected(String reason){this.reason=reason;}public String reason(){return reason;}}
    public static final class InvalidChange extends Rejected{InvalidChange(){super("INVALID_CHANGE");}}
    public static final class Conflict extends Rejected{Conflict(){super("CONFLICT");}}
    private static final class Planned {final FactKey key;Long expected;final ObjectNode patch;boolean delete;Planned(FactKey k,Long e,ObjectNode p){key=k;expected=e;patch=p;}Planned(FactKey k,Long e,ObjectNode p,boolean d){this(k,e,p);delete=d;}}
}
