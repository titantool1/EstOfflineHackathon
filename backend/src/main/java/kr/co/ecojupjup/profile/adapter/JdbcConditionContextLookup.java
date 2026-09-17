package kr.co.ecojupjup.profile.adapter;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.ConditionContext;
import kr.co.ecojupjup.profile.facts.FactTable;
import kr.co.ecojupjup.profile.facts.FactKey;
import kr.co.ecojupjup.profile.facts.PrivateFactsStore;
import kr.co.ecojupjup.profile.facts.StoredFact;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import kr.co.ecojupjup.profile.application.ConditionContext.*;
import kr.co.ecojupjup.profile.application.ConditionContextService;
import kr.co.ecojupjup.profile.application.ConditionContextService.Selection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class JdbcConditionContextLookup implements ConditionContextService.Lookup {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PrivateFactsStore facts;
    public JdbcConditionContextLookup(JdbcTemplate jdbc, ObjectMapper mapper,
            PrivateFactsStore facts) {
        this.jdbc=jdbc; this.mapper=mapper; this.facts=facts;
    }
    @Override
    @Transactional(readOnly=true,
        isolation=Isolation.REPEATABLE_READ)
    public ConditionContext load(UUID owner, Selection selection) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM app.users WHERE id=?)",Boolean.class,owner))
            || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM app.catalog_action WHERE program_key=? AND action_id=?)",
                Boolean.class,selection.programKey(),selection.actionId()))) throw new ConditionContextService.NotFound();
        checkSelection(owner,"user_households","household_id",selection.householdId());
        checkSelection(owner,"user_homes","home_id",selection.homeId());
        checkSelection(owner,"user_vehicles","vehicle_id",selection.vehicleId());
        return new Projection(owner,selection).build();
    }
    private void checkSelection(UUID owner,String table,String field,UUID id) {
        if(id!=null && !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM app."+table+
                " WHERE user_id=? AND "+field+"=?)",Boolean.class,owner,id))) throw new ConditionContextService.NotFound();
    }
    private final class Projection {
        private final UUID owner;
        private final Selection selection;
        private final Map<String,List<StoredFact>> cache=new java.util.HashMap<>();
        Projection(UUID owner,Selection selection) { this.owner=owner;this.selection=selection; }
        List<StoredFact> family(FactTable table) {
            return cache.computeIfAbsent(table.name(),k->facts.list(owner,table));
        }
        JsonNode entity(FactTable table,UUID id) {
            return facts.find(owner,new FactKey(table,id,null,null,null))
                .map(StoredFact::values).orElseGet(mapper::createObjectNode);
        }
        JsonNode profile() {
            return family(FactTable.PROFILE).stream().findFirst()
                .map(StoredFact::values).orElseGet(mapper::createObjectNode);
        }
        JsonNode welfare(String code,String scope,UUID member) {
            String cacheKey="welfare:"+scope;
            var rows=cache.computeIfAbsent(cacheKey,k->facts.listWelfare(owner,scope,
                scope.equals("member")?selection.householdId():null));
            return rows.stream().filter(r->java.util.Objects.equals(r.key().memberId(),member)
                && code.equals(r.values().path("welfare_code").asText())).findFirst()
                .map(r->factNode(r.values(),"has_status")).orElseGet(()->mapper.nullNode());
        }
        JsonNode factNode(JsonNode row,String field) {
            JsonNode value=row.path(field);
            if(value.isMissingNode() || value.isNull()) return mapper.nullNode();
            var fact=mapper.createObjectNode(); fact.set("value",value);
            fact.set("observed_at",row.path("observed_at")); fact.set("source_kind",row.path("source_kind"));
            return fact;
        }
        ConditionContext build() {
            var root=mapper.createObjectNode().put("user_id",owner.toString()).put("program_key",selection.programKey())
                .put("action_id",selection.actionId()).put("eligibility_status","not_evaluated");
            var inputs=root.putArray("inputs");
            var basic=jdbc.queryForList("""
                SELECT input_key,source_kind,relation,service_code,
                    jsonb_agg(condition_id ORDER BY condition_id)::text AS conditions
                FROM app.benefit_condition_inputs WHERE program_key=? AND action_id=?
                GROUP BY input_key,source_kind,relation,service_code,selector_code ORDER BY input_key,selector_code
                """,selection.programKey(),selection.actionId());
            for(var binding:basic) {
                String kind=(String)binding.get("source_kind");
                var input=mapper.createObjectNode().put("input_key",(String)binding.get("input_key"));
                input.set("condition_ids",mapper.readTree((String)binding.get("conditions")));
                var selector=input.putObject("selector"); JsonNode fact;
                if(kind.equals("profile")) fact=factNode(profile(),"birth_date");
                else if(kind.equals("membership")) {
                    String code=(String)binding.get("service_code"); selector.put("service_code",code);
                    fact=family(FactTable.MEMBERSHIP).stream()
                        .filter(r->code.equals(r.values().path("service_code").asText())).findFirst()
                        .map(r->factNode(r.values(),"is_member")).orElseGet(()->mapper.nullNode());
                } else if(kind.equals("region")) {
                    String relation=(String)binding.get("relation");selector.put("relation",relation);
                    var matching=family(FactTable.REGION).stream()
                        .filter(r->relation.equals(r.values().path("relation").asText()))
                        .sorted(java.util.Comparator.comparing(r->r.values().path("region_id").asText())).toList();
                    if(matching.isEmpty()) fact=mapper.nullNode();
                    else {
                        var combined=mapper.createObjectNode();var values=combined.putArray("value");var evidence=combined.putArray("evidence");
                        for(var row:matching) {
                            values.add(row.values().path("region_id")); var ev=mapper.createObjectNode();
                            for(String f:List.of("region_id","observed_at","source_kind"))ev.set(f,row.values().path(f));
                            evidence.add(ev);
                        }
                        fact=combined;
                    }
                } else throw new IllegalStateException("UNKNOWN_INPUT_SOURCE");
                input.set("user_fact",fact);inputs.add(input);
            }
            var detail=jdbc.queryForList("""
                SELECT b.input_key,d.domain,d.field_name,d.value_type,b.subject_scope,b.welfare_code,
                    jsonb_agg(b.condition_id ORDER BY b.condition_id)::text AS conditions
                FROM app.detail_condition_inputs b JOIN app.detail_input_definitions d USING(input_key,domain)
                WHERE b.program_key=? AND b.action_id=?
                GROUP BY b.input_key,d.domain,d.field_name,d.value_type,b.subject_scope,b.welfare_code,b.selector_code
                ORDER BY b.input_key,b.selector_code
                """,selection.programKey(),selection.actionId());
            for(var binding:detail) {
                String scope=(String)binding.get("subject_scope"),domain=(String)binding.get("domain"),field=(String)binding.get("field_name");
                var input=mapper.createObjectNode().put("input_key",(String)binding.get("input_key"))
                    .put("value_type",(String)binding.get("value_type")).put("value_shape",scope.equals("household")?"by_member":"scalar");
                input.set("condition_ids",mapper.readTree((String)binding.get("conditions")));
                var selector=input.putObject("selector").put("subject_scope",scope);
                String code=(String)binding.get("welfare_code");if(code!=null)selector.put("welfare_code",code);
                UUID target=switch(scope) { case "household"->selection.householdId();case "home"->selection.homeId();
                    case "vehicle"->selection.vehicleId();case "self"->owner;default->throw new IllegalStateException("UNKNOWN_TARGET_SCOPE"); };
                input.put("selection_status",target==null?"not_selected":"selected_or_self");
                JsonNode fact=mapper.nullNode();
                if(target!=null) {
                    if(scope.equals("self") && domain.equals("welfare")) fact=welfare(code,"self",null);
                    else if(scope.equals("household")) {
                        JsonNode household=entity(FactTable.HOUSEHOLD,target);
                        var group=mapper.createObjectNode().put("household_id",target.toString());
                        group.set("members_complete",household.path("members_complete"));var members=group.putArray("members");
                        var rows=cache.computeIfAbsent("members",k->facts.listMembers(owner,target));
                        for(var row:rows.stream().sorted(java.util.Comparator.comparing(r->r.key().id().toString())).toList()) {
                            JsonNode val=row.values();String relation=val.path("relation_to_applicant").asText();
                            var member=mapper.createObjectNode().put("member_id",row.key().id().toString()).put("relation_to_applicant",relation);
                            member.set("on_resident_register",val.has("on_resident_register")?val.path("on_resident_register"):mapper.nullNode());
                            JsonNode mf=domain.equals("welfare")?welfare(code,relation.equals("self")?"self":"member",relation.equals("self")?null:row.key().id())
                                : relation.equals("self") && field.equals("birth_date")?factNode(profile(),"birth_date"):factNode(val,field);
                            member.set("fact",mf);members.add(member);
                        }
                        fact=group;
                    } else if(scope.equals("home") || scope.equals("vehicle")) {
                        fact=factNode(entity(scope.equals("home")?FactTable.HOME:FactTable.VEHICLE,target),field);
                    } else throw new IllegalStateException("UNKNOWN_INPUT_SOURCE");
                }
                input.set("user_fact",fact);inputs.add(input);
            }
            var unmapped=root.putArray("conditions_without_user_binding");
            jdbc.queryForList("""
                SELECT ac.condition_id FROM app.action_condition ac WHERE ac.program_key=? AND ac.action_id=?
                AND NOT EXISTS(SELECT 1 FROM app.benefit_condition_inputs b WHERE b.program_key=ac.program_key
                    AND b.action_id=ac.action_id AND b.condition_id=ac.condition_id)
                AND NOT EXISTS(SELECT 1 FROM app.detail_condition_inputs b WHERE b.program_key=ac.program_key
                    AND b.action_id=ac.action_id AND b.condition_id=ac.condition_id) ORDER BY ac.condition_id
                """,String.class,selection.programKey(),selection.actionId()).forEach(unmapped::add);
            return project(root,owner,selection);
        }
    }

    static ConditionContext project(JsonNode raw, UUID owner, Selection selection) {
        if (!owner.toString().equals(raw.path("user_id").asText())
                || !selection.programKey().equals(raw.path("program_key").asText())
                || !selection.actionId().equals(raw.path("action_id").asText())
                || !raw.path("inputs").isArray() || !"not_evaluated".equals(raw.path("eligibility_status").asText())) throw new IllegalStateException("INVALID_CONTEXT_RESULT");
        List<Input> inputs = new ArrayList<>();
        List<UnselectedInput> unselected = new ArrayList<>();
        Map<UUID, Household> households = new LinkedHashMap<>();
        for (JsonNode input : raw.path("inputs")) {
            String key = input.path("input_key").asText();
            Map<String, String> selector = new LinkedHashMap<>();
            input.path("selector").properties().forEach(entry -> {
                if (!entry.getKey().equals("subject_scope")) selector.put(entry.getKey(), entry.getValue().asText());
            });
            List<String> conditions = strings(input.path("condition_ids"));
            String scope = input.path("selector").path("subject_scope").asText("self");
            String type = input.has("value_type") ? input.path("value_type").asText() : switch (key) {
                case "person.birth_date" -> "date";
                case "location.region_ids" -> "region_id_array";
                case "membership.is_member" -> "boolean";
                default -> throw new IllegalStateException("UNKNOWN_INPUT_TYPE");
            };
            if (input.path("selection_status").asText().equals("not_selected")) {
                unselected.add(new UnselectedInput(key, selector, scope, conditions));
                continue;
            }
            JsonNode fact = input.path("user_fact");
            if (input.path("value_shape").asText().equals("by_member")) {
                if (!fact.path("members").isArray() || !fact.path("members_complete").isBoolean()) throw new IllegalStateException("INVALID_HOUSEHOLD");
                UUID householdId = UUID.fromString(fact.path("household_id").asText());
                if (!householdId.equals(selection.householdId())) throw new IllegalStateException("HOUSEHOLD_MISMATCH");
                List<Member> members = new ArrayList<>();
                for (JsonNode member : fact.path("members")) {
                    UUID memberId = UUID.fromString(member.path("member_id").asText());
                    String relation = member.path("relation_to_applicant").asText();
                    if (!member.has("on_resident_register") || !(member.path("on_resident_register").isNull() || member.path("on_resident_register").isBoolean())) throw new IllegalStateException("INVALID_MEMBER");
                    members.add(new Member(memberId, relation, member.path("on_resident_register").isNull()
                            ? null : member.path("on_resident_register").booleanValue()));
                    // These SQL projections reuse the applicant's original profile/self record.
                    boolean sharedSelf = relation.equals("self") && (key.equals("member.birth_date") || key.equals("welfare.has_status"));
                    String canonicalKey = sharedSelf && key.equals("member.birth_date") ? "person.birth_date" : key;
                    Target target = sharedSelf ? new Target("self", owner, null) : new Target("member", memberId, householdId);
                    inputs.add(new Input(canonicalKey, selector, target, type, conditions, fact(member.path("fact"))));
                }
                Household household = new Household(householdId, fact.path("members_complete").booleanValue(), members);
                Household previous = households.putIfAbsent(householdId, household);
                if (previous != null && !previous.equals(household)) throw new IllegalStateException("HOUSEHOLD_METADATA_MISMATCH");
            } else {
                UUID targetId = switch (scope) {
                    case "self" -> owner;
                    case "home" -> selection.homeId();
                    case "vehicle" -> selection.vehicleId();
                    default -> throw new IllegalStateException("UNKNOWN_TARGET_SCOPE");
                };
                if (targetId == null || (!fact.isNull() && fact.has("entity_id")
                        && !targetId.toString().equals(fact.path("entity_id").asText()))) {
                    throw new IllegalStateException("ENTITY_MISMATCH");
                }
                inputs.add(new Input(key, selector, new Target(scope, targetId, null), type, conditions, fact(fact)));
            }
        }
        return new ConditionContext(owner, selection.programKey(), selection.actionId(), inputs, unselected,
                strings(raw.path("conditions_without_user_binding")), new ArrayList<>(households.values()), "not_evaluated");
    }
    private static Fact fact(JsonNode fact) {
        if (fact.isNull()) return null;
        JsonNode value = fact.path("value");
        Object typed = value.isBoolean() ? value.booleanValue() : value.isNumber() ? value.numberValue()
                : value.isTextual() ? value.asText() : value.isArray() ? strings(value) : null;
        if (typed == null) throw new IllegalStateException("INVALID_STORED_VALUE");
        List<Evidence> evidence = new ArrayList<>();
        if (fact.has("evidence")) {
            for (JsonNode record : fact.path("evidence")) evidence.add(new Evidence(record.path("observed_at").asText(),
                    record.path("source_kind").asText(), record.path("region_id").asText()));
        } else evidence.add(new Evidence(fact.path("observed_at").asText(), fact.path("source_kind").asText(), null));
        return new Fact(typed, evidence);
    }
    private static List<String> strings(JsonNode array) {
        if (!array.isArray()) throw new IllegalStateException("INVALID_CONTEXT_LIST");
        List<String> values = new ArrayList<>();
        for (JsonNode value : array) {
            if (!value.isTextual()) throw new IllegalStateException("INVALID_CONTEXT_LIST_VALUE");
            values.add(value.asText());
        }
        return values;
    }
}
