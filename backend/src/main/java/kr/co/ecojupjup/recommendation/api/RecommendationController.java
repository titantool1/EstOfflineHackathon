package kr.co.ecojupjup.recommendation.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.recommendation.application.RecommendationException;
import kr.co.ecojupjup.recommendation.application.RecommendationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/missions/recommendations")
public class RecommendationController {
    private final RecommendationService service;
    public RecommendationController(RecommendationService service) { this.service=service; }

    @PostMapping public ResponseEntity<?> create(@RequestBody Input input,HttpServletRequest request) {
        UUID owner=MemberRequestContext.owner(request); String id=id(request);
        if (owner==null) return failure(401,"AUTHENTICATION_REQUIRED",id);
        if (input==null || input.clientRequestId()==null) return failure(400,"INVALID_RECOMMENDATION_REQUEST",id);
        try { return success(service.create(owner,input.clientRequestId(),input.limit(),input.mode()),id); }
        catch (RecommendationException error) { return failure(error.status,error.code,id); }
    }

    @GetMapping("/{batchId}") public ResponseEntity<?> get(@PathVariable UUID batchId,HttpServletRequest request) {
        UUID owner=MemberRequestContext.owner(request); String id=id(request);
        if (owner==null) return failure(401,"AUTHENTICATION_REQUIRED",id);
        try { return success(service.get(owner,batchId),id); }
        catch (RecommendationException error) { return failure(error.status,error.code,id); }
    }
    private static String id(HttpServletRequest request) { return (String)request.getAttribute(RequestIdFilter.ATTRIBUTE); }
    private static ResponseEntity<?> success(Object data,String id) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.success(data,id)); }
    private static ResponseEntity<?> failure(int status,String code,String id) { return ResponseEntity.status(status).header("Cache-Control","no-store")
            .body(ApiResponse.failure(code,status==404?"추천 묶음을 찾을 수 없습니다.":"추천 요청을 확인해 주세요.",id)); }
    public record Input(UUID clientRequestId,Integer limit,String mode) {}
}
