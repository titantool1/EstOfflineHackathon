package kr.co.ecojupjup.profile.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Read-only user facts and their dependencies; this is not an eligibility decision. */
public record ConditionContext(UUID userId, String programKey, String actionId,
        List<Input> inputs, List<UnselectedInput> unselectedInputs,
        List<String> unmappedConditionIds, List<Household> households, String eligibilityStatus) {
    public record Target(String kind, UUID id, UUID householdId) {}
    public record Evidence(String observedAt, String sourceKind, String reference) {}
    public record Fact(Object value, List<Evidence> evidence) {}
    public record Input(String inputKey, Map<String, String> selector, Target target,
                        String valueType, List<String> conditionIds, Fact fact) {}
    public record UnselectedInput(String inputKey, Map<String, String> selector,
                                  String targetKind, List<String> conditionIds) {}
    public record Member(UUID id, String relationToApplicant, Boolean onResidentRegister) {}
    public record Household(UUID id, boolean membersComplete, List<Member> members) {}
}
