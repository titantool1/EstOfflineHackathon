package kr.co.ecojupjup.health.application;

import org.springframework.stereotype.Service;

@Service
public class HealthService {
    private final DatabaseProbe database;

    public HealthService(DatabaseProbe database) {
        this.database = database;
    }

    public HealthStatus check() {
        database.verifyConnection();
        return new HealthStatus("UP", "UP");
    }

    public record HealthStatus(String status, String database) {}
}
