package kr.co.ecojupjup.profile.adapter;

import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.InterestProfile;
import kr.co.ecojupjup.profile.application.InterestService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcInterestStore implements InterestService.Store {
    private final JdbcTemplate jdbc;
    public JdbcInterestStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public List<InterestProfile.Option> findOptions() {
        return jdbc.query("""
                SELECT interest_id, title, description
                FROM app.catalog_interest
                ORDER BY CASE WHEN interest_id = 'unsure' THEN 1 ELSE 0 END, interest_id
                """, (row, index) -> new InterestProfile.Option(
                row.getString(1), row.getString(2), row.getString(3)));
    }

    @Override
    public List<String> findInterestIds(UUID owner) {
        return jdbc.queryForList("""
                SELECT ui.interest_id
                FROM app.user_interests ui
                JOIN app.catalog_interest ci ON ci.interest_id = ui.interest_id
                WHERE ui.user_id = ?
                ORDER BY CASE WHEN ui.interest_id = 'unsure' THEN 1 ELSE 0 END, ui.interest_id
                """, String.class, owner);
    }

    @Override
    public void lockOwner(UUID owner) {
        jdbc.queryForObject("SELECT id FROM app.users WHERE id = ? FOR UPDATE", UUID.class, owner);
    }

    @Override
    public void replace(UUID owner, List<String> interestIds) {
        jdbc.update("DELETE FROM app.user_interests WHERE user_id = ?", owner);
        for (String interestId : interestIds) {
            jdbc.update("INSERT INTO app.user_interests (user_id, interest_id) VALUES (?, ?)", owner, interestId);
        }
    }
}
