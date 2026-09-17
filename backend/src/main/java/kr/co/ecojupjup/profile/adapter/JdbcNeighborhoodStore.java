package kr.co.ecojupjup.profile.adapter;

import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.Neighborhood;
import kr.co.ecojupjup.profile.application.NeighborhoodService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcNeighborhoodStore implements NeighborhoodService.Store {
    private final JdbcTemplate jdbc;
    public JdbcNeighborhoodStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public Optional<Neighborhood> find(UUID owner) {
        return jdbc.query("""
                SELECT neighborhood_code, neighborhood_sido, neighborhood_sigungu, neighborhood_dong
                FROM app.user_profiles WHERE user_id = ? AND neighborhood_code IS NOT NULL
                """, (row, index) -> new Neighborhood(row.getString(1), row.getString(2),
                row.getString(3), row.getString(4)), owner).stream().findFirst();
    }

    @Override
    public void save(UUID owner, Neighborhood neighborhood) {
        jdbc.update("""
                INSERT INTO app.user_profiles
                    (user_id, neighborhood_code, neighborhood_sido, neighborhood_sigungu, neighborhood_dong)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (user_id) DO UPDATE SET
                    neighborhood_code = EXCLUDED.neighborhood_code,
                    neighborhood_sido = EXCLUDED.neighborhood_sido,
                    neighborhood_sigungu = EXCLUDED.neighborhood_sigungu,
                    neighborhood_dong = EXCLUDED.neighborhood_dong
                """, owner, neighborhood.regionCode(), neighborhood.sido(),
                neighborhood.sigungu(), neighborhood.dong());
    }
}
