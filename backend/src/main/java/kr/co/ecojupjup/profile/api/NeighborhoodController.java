package kr.co.ecojupjup.profile.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.profile.application.Neighborhood;
import kr.co.ecojupjup.profile.application.NeighborhoodService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NeighborhoodController {
    private final NeighborhoodService service;
    public NeighborhoodController(NeighborhoodService service) { this.service = service; }

    @GetMapping("/api/profile/neighborhood")
    public ResponseEntity<?> get(HttpServletRequest request) {
        String requestId = id(request);
        UUID owner = MemberRequestContext.owner(request);
        if (owner == null) return failure(401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.", requestId);
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(ApiResponse.success(new View(service.get(owner).orElse(null)), requestId));
    }

    @PutMapping("/api/profile/neighborhood")
    public ResponseEntity<?> put(@RequestBody Input input, HttpServletRequest request) {
        String requestId = id(request);
        UUID owner = MemberRequestContext.owner(request);
        if (owner == null) return failure(401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.", requestId);
        try {
            if (input == null) throw new IllegalArgumentException("INVALID_NEIGHBORHOOD");
            Neighborhood saved = service.save(owner, new Neighborhood(input.regionCode(), input.sido(),
                    input.sigungu(), input.dong()));
            return ResponseEntity.ok().header("Cache-Control", "no-store")
                    .body(ApiResponse.success(new View(saved), requestId));
        } catch (IllegalArgumentException error) {
            return failure(400, "INVALID_NEIGHBORHOOD", "저장할 동네를 다시 선택해 주세요.", requestId);
        }
    }

    private static String id(HttpServletRequest request) {
        return (String) request.getAttribute(RequestIdFilter.ATTRIBUTE);
    }
    private static ResponseEntity<?> failure(int status, String code, String message, String requestId) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(ApiResponse.failure(code, message, requestId));
    }

    public record Input(String regionCode, String sido, String sigungu, String dong) {}
    public record View(Neighborhood neighborhood) {}
}
