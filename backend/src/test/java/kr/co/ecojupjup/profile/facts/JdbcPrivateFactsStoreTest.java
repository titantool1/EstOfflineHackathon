package kr.co.ecojupjup.profile.facts;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import tools.jackson.databind.ObjectMapper;

class JdbcPrivateFactsStoreTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final JdbcPrivateFactsStore store = new JdbcPrivateFactsStore(jdbc, new ObjectMapper(),
            new PrivateFactsCrypto("test", Map.of("test", new byte[32])));

    @Test
    void memberSelectionFiltersByHouseholdBeforeAnyRowsCanBeDecrypted() {
        UUID owner = UUID.randomUUID();
        UUID household = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());

        assertEquals(List.of(), store.listMembers(owner, household));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), any(Object[].class));
        assertEquals(true, sql.getValue().contains("WHERE user_id=? AND household_id=?"));
    }

    @Test
    void welfareSelectionRejectsImpossibleScopeShapeBeforeJdbc() {
        PrivateFactsException error = assertThrows(PrivateFactsException.class,
                () -> store.listWelfare(UUID.randomUUID(), "self", UUID.randomUUID()));

        assertEquals(PrivateFactsException.Code.INVALID_KEY, error.code());
        verifyNoInteractions(jdbc);
    }

    @Test
    void welfareSelectionTurnsNullScopeIntoTypedError() {
        PrivateFactsException error = assertThrows(PrivateFactsException.class,
                () -> store.listWelfare(UUID.randomUUID(), null, null));

        assertEquals(PrivateFactsException.Code.INVALID_KEY, error.code());
        verifyNoInteractions(jdbc);
    }
}
