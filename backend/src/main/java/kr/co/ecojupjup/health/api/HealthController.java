package kr.co.ecojupjup.health.api;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.health.application.HealthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final HealthService health;

    public HealthController(HealthService health) {
        this.health = health;
    }

    @GetMapping("/api/health")
    public ApiResponse<HealthService.HealthStatus> health(HttpServletRequest request) {
        return ApiResponse.success(health.check(), (String) request.getAttribute(RequestIdFilter.ATTRIBUTE));
    }
}
