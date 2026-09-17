package kr.co.ecojupjup.profile.api;

import jakarta.servlet.http.HttpServletRequest;
import java.io.*;
import java.util.UUID;
import kr.co.ecojupjup.common.api.*;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.profile.application.*;
import kr.co.ecojupjup.profile.application.ConditionSaveMapper.Rejected;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

@RestController
public class ConditionSaveController {
    private static final int MAX_BODY=128*1024;
    private final ConditionSaveService service; private final ConditionSaveRequestParser parser;
    public ConditionSaveController(ConditionSaveService service,ObjectMapper json){this.service=service;this.parser=new ConditionSaveRequestParser(json);}
    @PostMapping(path="/api/profile/condition-save",consumes="application/json")
    public ResponseEntity<?> save(HttpServletRequest request) throws IOException {
        String requestId=(String)request.getAttribute(RequestIdFilter.ATTRIBUTE); UUID owner=MemberRequestContext.owner(request);
        if(owner==null)return failure(401,"AUTHENTICATION_REQUIRED","로그인이 필요합니다.",requestId);
        try {
            byte[] body=bounded(request.getInputStream()); ConditionSaveCommand command=parser.parse(body);
            if(!owner.equals(command.ownerId()))return failure(400,"INVALID_CONDITION_SAVE","저장 요청을 확인해 주세요.",requestId);
            service.save(owner,command);
            return ok(java.util.Map.of("status","saved"),requestId);
        } catch (ConditionSaveRequestParser.InvalidRequest|BodyTooLarge error) {
            return failure(400,"INVALID_CONDITION_SAVE","저장 요청을 확인해 주세요.",requestId);
        } catch (Rejected rejected) {
            return ok(java.util.Map.of("status","rejected","reason",rejected.reason()),requestId);
        }
    }
    private static byte[] bounded(InputStream input)throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int total=0,n;while((n=input.read(buffer))!=-1){total+=n;if(total>MAX_BODY)throw new BodyTooLarge();out.write(buffer,0,n);}return out.toByteArray();}
    private static ResponseEntity<?> ok(Object data,String id){return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.success(data,id));}
    private static ResponseEntity<?> failure(int status,String code,String message,String id){return ResponseEntity.status(status).header("Cache-Control","no-store").body(ApiResponse.failure(code,message,id));}
    private static final class BodyTooLarge extends RuntimeException {}
}
