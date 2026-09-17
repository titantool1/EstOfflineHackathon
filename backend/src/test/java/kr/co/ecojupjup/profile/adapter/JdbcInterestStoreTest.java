package kr.co.ecojupjup.profile.adapter;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.InterestProfile;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class JdbcInterestStoreTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");

    @Test void optionsComeFromTheCatalogAndSelectionsAreOwnerScoped() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        JdbcInterestStore store = new JdbcInterestStore(jdbc);
        var mapper = ArgumentCaptor.forClass(RowMapper.class);
        when(jdbc.query(contains("FROM app.catalog_interest"), mapper.capture())).thenReturn(List.of());
        assertTrue(store.findOptions().isEmpty());
        ResultSet row = mock(ResultSet.class);
        when(row.getString(1)).thenReturn("eco-learning");
        when(row.getString(2)).thenReturn("환경 체험·배우기");
        when(row.getString(3)).thenReturn("교육·체험·기후행동");
        InterestProfile.Option option = (InterestProfile.Option) mapper.getValue().mapRow(row, 0);
        assertEquals("eco-learning", option.id());

        when(jdbc.queryForList(anyString(), eq(String.class), eq(OWNER)))
                .thenReturn(List.of("eco-learning"));
        assertEquals(List.of("eco-learning"), store.findInterestIds(OWNER));
        verify(jdbc).queryForList(contains("WHERE ui.user_id = ?"), eq(String.class), eq(OWNER));
    }

    @Test void replacementUsesAnOwnerRowLockAndWritesOnlyThatOwner() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        JdbcInterestStore store = new JdbcInterestStore(jdbc);
        store.lockOwner(OWNER);
        verify(jdbc).queryForObject(contains("FOR UPDATE"), eq(UUID.class), eq(OWNER));

        store.replace(OWNER, List.of("eco-learning", "green-mobility"));
        var order = inOrder(jdbc);
        order.verify(jdbc).update(contains("DELETE FROM app.user_interests WHERE user_id = ?"), eq(OWNER));
        order.verify(jdbc).update(contains("INSERT INTO app.user_interests"), eq(OWNER), eq("eco-learning"));
        order.verify(jdbc).update(contains("INSERT INTO app.user_interests"), eq(OWNER), eq("green-mobility"));
    }
}
