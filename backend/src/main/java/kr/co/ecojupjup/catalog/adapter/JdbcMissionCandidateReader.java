package kr.co.ecojupjup.catalog.adapter;

import java.sql.Array;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.co.ecojupjup.catalog.application.MissionCandidateReader;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcMissionCandidateReader implements MissionCandidateReader {
    private final NamedParameterJdbcTemplate jdbc;
    public JdbcMissionCandidateReader(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public List<Candidate> find(List<String> selectedInterestIds, int limit) {
        boolean exploration = selectedInterestIds.isEmpty() || selectedInterestIds.contains("unsure");
        Map<String, Object> values = new HashMap<>();
        values.put("interests", exploration ? List.of("__catalog_exploration__") : selectedInterestIds);
        values.put("limit", limit);
        return jdbc.query("""
            SELECT a.program_key,a.action_id,a.identity_basis,
              COALESCE(p.payload->>'display_title',p.payload->>'title','') AS program_title,
              COALESCE(p.payload->>'summary',p.payload->>'benefit','') AS program_summary,
              COALESCE(p.payload->>'status','') AS program_status_raw,
              (SELECT count(*) FROM app.action_condition ac
                WHERE ac.program_key=a.program_key AND ac.action_id=a.action_id) AS condition_count,
              CASE WHEN :exploration THEN ARRAY[]::text[] ELSE
                COALESCE((SELECT array_agg(DISTINCT ai.interest_id ORDER BY ai.interest_id)
                  FROM app.catalog_action_interest ai
                  WHERE ai.program_key=a.program_key AND ai.action_id=a.action_id
                    AND ai.interest_id IN (:interests)),ARRAY[]::text[]) END AS matched_interest_ids,
              (SELECT count(DISTINCT ap.place_id) FROM app.action_place ap
                WHERE ap.program_key=a.program_key AND ap.action_id=a.action_id) AS related_place_count
            FROM app.catalog_action a JOIN app.catalog_program p USING(program_key)
            WHERE :exploration OR EXISTS (SELECT 1 FROM app.catalog_action_interest ai
              WHERE ai.program_key=a.program_key AND ai.action_id=a.action_id
                AND ai.interest_id IN (:interests))
            ORDER BY a.program_key,a.action_id LIMIT :limit
            """, new org.springframework.jdbc.core.namedparam.MapSqlParameterSource(values)
                    .addValue("exploration", exploration), (row, index) -> new Candidate(
                row.getString(1), row.getString(2), row.getString(3), row.getString(4),
                row.getString(5), row.getString(6), row.getInt(7), strings(row.getArray(8)), row.getInt(9)));
    }

    private static List<String> strings(Array value) throws SQLException {
        if (value == null) return List.of();
        return Arrays.stream((Object[]) value.getArray()).map(Object::toString).toList();
    }
}
