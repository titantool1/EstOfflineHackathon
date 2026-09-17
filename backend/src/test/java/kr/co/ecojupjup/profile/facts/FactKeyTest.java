package kr.co.ecojupjup.profile.facts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class FactKeyTest {
    @Test
    void cryptoIdentityIncludesEveryStructuralComponent() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID household = UUID.fromString("00000000-0000-0000-0000-000000000002");
        UUID member = UUID.fromString("00000000-0000-0000-0000-000000000003");
        FactKey base = new FactKey(FactTable.WELFARE, id, household, member, "member");

        assertEquals(base.cryptoId(), new FactKey(FactTable.WELFARE, id, household, member, "member").cryptoId());
        assertNotEquals(base.cryptoId(), new FactKey(FactTable.WELFARE, id, household, member, "self").cryptoId());
        assertNotEquals(base.cryptoId(), new FactKey(FactTable.WELFARE, id, household, null, "member").cryptoId());
        assertNotEquals(base.cryptoId(), new FactKey(FactTable.MEMBER, id, household, null, null).cryptoId());
    }

    @Test
    void tableNamesAreCanonicalCryptoDomainsAndSqlNames() {
        assertEquals("user_profiles", FactTable.PROFILE.sqlTable());
        assertEquals("user_id", FactTable.PROFILE.idColumn());
        assertEquals("region_fact_id", FactTable.REGION.idColumn());
        assertEquals("membership_fact_id", FactTable.MEMBERSHIP.idColumn());
    }
}
