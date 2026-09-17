package kr.co.ecojupjup.activity.api;

import jakarta.servlet.http.HttpServletRequest;
import java.time.OffsetDateTime;
import java.util.UUID;
import kr.co.ecojupjup.activity.application.MissionEventException;
import kr.co.ecojupjup.activity.application.MissionEventService;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/missions/events")
public class MissionEventController {
    private final MissionEventService service;
    public MissionEventController(MissionEventService service) { this.service=service; }
    @PostMapping public ResponseEntity<?> post(@RequestBody Input input,HttpServletRequest request) {
        UUID owner=MemberRequestContext.owner(request); String id=(String)request.getAttribute(RequestIdFilter.ATTRIBUTE);
        if (owner==null) return failure(401,"AUTHENTICATION_REQUIRED",id);
        try {
            if (input==null) throw new MissionEventException(400,"INVALID_MISSION_EVENT");
            var result=service.record(owner,input.clientEventId(),input.batchId(),input.itemId(),input.eventType(),input.occurredAt());
            return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.success(result,id));
        } catch (MissionEventException error) { return failure(error.status,error.code,id); }
    }
    private static ResponseEntity<?> failure(int status,String code,String id) { return ResponseEntity.status(status).header("Cache-Control","no-store")
            .body(ApiResponse.failure(code,status==404?"추천 항목을 찾을 수 없습니다.":"활동 기록 요청을 확인해 주세요.",id)); }
    public record Input(UUID clientEventId,UUID batchId,UUID itemId,String eventType,OffsetDateTime occurredAt) {}
}
