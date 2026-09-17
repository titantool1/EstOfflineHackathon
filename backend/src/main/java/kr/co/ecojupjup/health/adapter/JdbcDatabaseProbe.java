package kr.co.ecojupjup.health.adapter;

import kr.co.ecojupjup.health.application.DatabaseProbe;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcDatabaseProbe implements DatabaseProbe {
    private final JdbcTemplate jdbc;

    public JdbcDatabaseProbe(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void verifyConnection() {
        jdbc.queryForObject("SELECT 1", Integer.class);
    }
}
