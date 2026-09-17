package kr.co.ecojupjup.profile.facts;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class PrivateFactPayloadCodecTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final PrivateFactPayloadCodec codec = new PrivateFactPayloadCodec(mapper);

    @Test
    void preservesFalseZeroAbsenceAndExplicitNullAsDistinctJsonValues() {
        ObjectNode member = object("""
                {"relation_to_applicant":"child","on_resident_register":false,
                 "birth_date":null,"preschool":false,"observed_at":"2026-09-17T12:00:00+09:00",
                 "source_kind":"user_statement"}
                """);

        ObjectNode decoded = codec.decode(FactTable.MEMBER, codec.encode(FactTable.MEMBER, member));

        assertEquals(false, decoded.get("on_resident_register").booleanValue());
        assertEquals(true, decoded.get("birth_date").isNull());
        assertEquals(false, decoded.has("registered_disability"));
    }

    @Test
    void profileAllowsNeighborhoodWithoutInventingBirthObservation() {
        ObjectNode profile = object("""
                {"birth_date":null,"observed_at":null,"source_kind":null,
                 "neighborhood_code":"1111010100","neighborhood_sido":"서울특별시",
                 "neighborhood_sigungu":"종로구","neighborhood_dong":"청운동"}
                """);

        assertDoesNotThrow(() -> codec.validate(FactTable.PROFILE, profile));
    }

    @Test
    void rejectsExtraFieldsInvalidDatesAndNonPositiveSeats() {
        assertInvalid(FactTable.REGION, """
                {"relation":"work","region_id":"11","observed_at":"2026-09-17T00:00:00+09:00",
                 "source_kind":"user_statement","plaintext_leak":"x"}
                """);
        assertInvalid(FactTable.HOME, """
                {"building_approval_date":"2026-09-18","observed_at":"2026-09-17T23:59:59+09:00",
                 "source_kind":"user_statement"}
                """);
        assertInvalid(FactTable.VEHICLE, """
                {"seating_capacity":0,"observed_at":"2026-09-17T00:00:00+09:00",
                 "source_kind":"user_statement"}
                """);
    }

    @Test
    void rejectsPartialNeighborhoodAndSelfMemberBirthDate() {
        assertInvalid(FactTable.PROFILE, """
                {"neighborhood_code":"1111010100","neighborhood_sido":"서울특별시"}
                """);
        assertInvalid(FactTable.MEMBER, """
                {"relation_to_applicant":"self","birth_date":"2000-01-01",
                 "observed_at":"2026-09-17T00:00:00+09:00","source_kind":"user_statement"}
                """);
    }

    @Test
    void rejectsMissingRequiredMetadataButAcceptsNullableEntityFields() {
        assertInvalid(FactTable.WELFARE, "{\"welfare_code\":\"disabled\",\"has_status\":false}");
        assertDoesNotThrow(() -> codec.validate(FactTable.HOME, object("""
                {"region_id":null,"dwelling_type":null,"electricity_contract_kind":null,
                 "building_approval_date":null,"observed_at":"2026-09-17T00:00:00Z",
                 "source_kind":"user_statement"}
                """)));
    }

    private void assertInvalid(FactTable table, String json) {
        PrivateFactsException error = assertThrows(PrivateFactsException.class,
                () -> codec.validate(table, object(json)));
        assertEquals(PrivateFactsException.Code.INVALID_PAYLOAD, error.code());
    }

    private ObjectNode object(String json) { return (ObjectNode) mapper.readTree(json); }
}
