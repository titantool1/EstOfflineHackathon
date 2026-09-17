package kr.co.ecojupjup.profile.facts;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

/** Structural identity that remains outside the encrypted payload. */
public record FactKey(FactTable table, UUID id, UUID householdId, UUID memberId, String subjectScope) {
    public FactKey {
        Objects.requireNonNull(table, "table");
        Objects.requireNonNull(id, "id");
    }

    /** Stable, unambiguous AAD row identity containing every structural key. */
    public String cryptoId() {
        return part(table.name()) + part(id.toString()) + part(value(householdId))
                + part(value(memberId)) + part(subjectScope);
    }

    private static String value(Object value) { return value == null ? "" : value.toString(); }
    private static String part(String value) {
        String actual = value == null ? "" : value;
        return actual.getBytes(StandardCharsets.UTF_8).length + ":" + actual;
    }
}
