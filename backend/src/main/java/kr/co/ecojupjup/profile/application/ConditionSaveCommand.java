package kr.co.ecojupjup.profile.application;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** Strictly parsed condition-save input. Values are redacted from toString(). */
public record ConditionSaveCommand(UUID conversationId, UUID ownerId, UUID attemptId,
        List<Change> changes, byte[] canonicalPayload) {
    public record Change(String slotId, Input input, Operation operation, Observation observation, Baseline baseline) {}
    public record Input(String inputKey, Map<String,String> selector, Target target, String valueType) {}
    public record Target(String kind, UUID id, UUID householdId) {}
    public record Operation(String kind, JsonNode value) {}
    public record Observation(String observedAt, String sourceKind, String turnId) {}
    public record Baseline(String status, JsonNode value) {}
    @Override public String toString() { return "ConditionSaveCommand[ownerId="+ownerId+", attemptId="+attemptId+", changes="+changes.size()+", payload=<redacted>]"; }
}
