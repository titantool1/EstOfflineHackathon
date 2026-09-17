package kr.co.ecojupjup.profile.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.profile.application.ConditionContextService;
import kr.co.ecojupjup.profile.application.ConditionContextService.Selection;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ConditionContextController {
    // Populated by the existing member/session adapter from its stored user ID.
    private final ConditionContextService service;
    public ConditionContextController(ConditionContextService service) { this.service = service; }

    @GetMapping("/api/profile/condition-context")
    public ResponseEntity<?> get(HttpServletRequest request,
            @RequestParam String programKey, @RequestParam String actionId,
            @RequestParam(required = false) UUID householdId,
            @RequestParam(required = false) UUID homeId,
            @RequestParam(required = false) UUID vehicleId) {
        String requestId = (String) request.getAttribute(RequestIdFilter.ATTRIBUTE);
        // A servlet attribute is server-side context, not a browser header or query parameter.
        UUID owner = MemberRequestContext.owner(request);
        if (owner == null) {
            return failure(401, "AUTHENTICATION_REQUIRED", "사용자 정보를 확인해 주세요.", requestId);
        }
        Selection selection;
        try {
            selection = new Selection(programKey, actionId, householdId, homeId, vehicleId);
        } catch (IllegalArgumentException error) {
            return failure(400, "INVALID_CONTEXT_SELECTION", "조회할 혜택과 대상을 확인해 주세요.", requestId);
        }
        try {
            var context = service.load(owner, selection);
            return ResponseEntity.ok().header("Cache-Control", "no-store")
                    .body(ApiResponse.success(context, requestId));
        } catch (ConditionContextService.NotFound error) {
            return failure(404, "CONDITION_CONTEXT_NOT_FOUND", "조회할 사용자·혜택·대상을 찾을 수 없습니다.", requestId);
        }
    }
    @GetMapping("/api/profile/conversation-context")
    public ResponseEntity<?> conversation(HttpServletRequest request) {
        String requestId = (String) request.getAttribute(RequestIdFilter.ATTRIBUTE);
        UUID owner = MemberRequestContext.owner(request);
        if (owner == null) return failure(401, "AUTHENTICATION_REQUIRED", "사용자 정보를 확인해 주세요.", requestId);
        try {
            return ResponseEntity.ok().header("Cache-Control", "no-store")
                    .body(ApiResponse.success(service.loadConversation(owner), requestId));
        } catch (ConditionContextService.NotFound error) {
            return failure(404, "CONDITION_CONTEXT_NOT_FOUND", "사용자 정보를 찾을 수 없습니다.", requestId);
        }
    }
    private ResponseEntity<?> failure(int status, String code, String message, String id) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store")
                .body(ApiResponse.failure(code, message, id));
    }
}
