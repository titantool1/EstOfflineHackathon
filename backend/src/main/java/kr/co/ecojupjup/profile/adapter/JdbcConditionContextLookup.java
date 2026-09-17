package kr.co.ecojupjup.profile.adapter;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.ConditionContext;
import kr.co.ecojupjup.profile.application.ConditionContext.*;
import kr.co.ecojupjup.profile.application.ConditionContextService;
import kr.co.ecojupjup.profile.application.ConditionContextService.Selection;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class JdbcConditionContextLookup implements ConditionContextService.Lookup {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public JdbcConditionContextLookup(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc; this.mapper = mapper;
    }
    @Override
    public ConditionContext load(UUID userId, Selection selection) {
        String json;
        try {
            // The function enforces ownership for all selected entities, in the same DB snapshot.
            json = jdbc.queryForObject("SELECT app.user_detail_context(?::uuid,?, ?,?::uuid,?::uuid,?::uuid)::text",
                    String.class, userId, selection.programKey(), selection.actionId(),
                    selection.householdId(), selection.homeId(), selection.vehicleId());
        } catch (DataAccessException error) {
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql && "22023".equals(sql.getSQLState())) {
                    throw new ConditionContextService.NotFound();
                }
            }
            throw error;
        }
        if (json == null) throw new ConditionContextService.NotFound();
        return project(mapper.readTree(json), userId, selection);
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
