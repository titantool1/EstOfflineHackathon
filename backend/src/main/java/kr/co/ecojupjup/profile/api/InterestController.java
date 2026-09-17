package kr.co.ecojupjup.profile.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.profile.application.InterestProfile;
import kr.co.ecojupjup.profile.application.InterestService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class InterestController {
    private final InterestService service;
    public InterestController(InterestService service) { this.service = service; }

    @GetMapping("/api/profile/interests")
    public ResponseEntity<?> get(HttpServletRequest request) {
        String requestId = id(request);
        UUID owner = MemberRequestContext.owner(request);
        if (owner == null) return failure(401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.", requestId);
        return success(service.get(owner), requestId);
    }

    @PutMapping("/api/profile/interests")
    public ResponseEntity<?> put(@RequestBody Input input, HttpServletRequest request) {
        String requestId = id(request);
        UUID owner = MemberRequestContext.owner(request);
        if (owner == null) return failure(401, "AUTHENTICATION_REQUIRED", "로그인이 필요합니다.", requestId);
        try {
            if (input == null) throw new IllegalArgumentException("INVALID_INTERESTS");
            return success(service.replace(owner, input.interestIds()), requestId);
        } catch (IllegalArgumentException error) {
            return failure(400, "INVALID_INTERESTS", "관심사를 다시 선택해 주세요.", requestId);
        }
    }

    private static ResponseEntity<?> success(InterestProfile profile, String requestId) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
                .body(ApiResponse.success(profile, requestId));
    }
    private static String id(HttpServletRequest request) {
        return (String) request.getAttribute(RequestIdFilter.ATTRIBUTE);
    }
    private static ResponseEntity<?> failure(int status, String code, String message, String requestId) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(ApiResponse.failure(code, message, requestId));
    }

    public record Input(List<String> interestIds) {}
}
