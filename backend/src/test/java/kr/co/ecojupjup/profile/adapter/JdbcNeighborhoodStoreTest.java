package kr.co.ecojupjup.profile.adapter;

import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.Neighborhood;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class JdbcNeighborhoodStoreTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");

    @Test void readsOnlyTheAuthenticatedOwnersAdministrativeNeighborhood() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var store = new JdbcNeighborhoodStore(jdbc);
        var mapper = ArgumentCaptor.forClass(RowMapper.class);
        when(jdbc.query(anyString(), mapper.capture(), eq(OWNER))).thenReturn(List.of());
        assertTrue(store.find(OWNER).isEmpty());
        verify(jdbc).query(contains("WHERE user_id = ?"), any(RowMapper.class), eq(OWNER));

        ResultSet row = mock(ResultSet.class);
        when(row.getString(1)).thenReturn("1230059000");
        when(row.getString(2)).thenReturn("전남광주통합특별시");
        when(row.getString(3)).thenReturn("북구");
        when(row.getString(4)).thenReturn("용봉동");
        Neighborhood result = (Neighborhood) mapper.getValue().mapRow(row, 0);
        assertEquals("1230059000", result.regionCode());
        assertEquals("전남광주통합특별시", result.sido());
    }

    @Test void upsertChangesOnlyNeighborhoodColumnsAndBindsTheOwner() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var store = new JdbcNeighborhoodStore(jdbc);
        var neighborhood = new Neighborhood("1230059000", "전남광주통합특별시", "북구", "용봉동");
        store.save(OWNER, neighborhood);
        verify(jdbc).update(argThat(sql -> sql.contains("ON CONFLICT (user_id)")
                        && !sql.contains("birth_date =") && !sql.contains("observed_at =")),
                eq(OWNER), eq("1230059000"), eq("전남광주통합특별시"), eq("북구"), eq("용봉동"));
    }
}
