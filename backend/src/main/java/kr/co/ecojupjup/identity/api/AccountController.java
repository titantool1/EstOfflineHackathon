package kr.co.ecojupjup.identity.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.adapter.MemberPrincipal;
import kr.co.ecojupjup.identity.application.AccountService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class AccountController {
    private final AccountService accounts;
    private final AuthenticationManager manager;
    private final SessionAuthenticationStrategy sessions;
    private final SecurityContextRepository contexts;
    public AccountController(AccountService accounts, AuthenticationManager manager,
            SessionAuthenticationStrategy sessions, SecurityContextRepository contexts) {
        this.accounts=accounts; this.manager=manager; this.sessions=sessions; this.contexts=contexts;
    }
    @GetMapping("/api/auth/csrf")
    public ApiResponse<Csrf> csrf(CsrfToken token,HttpServletRequest request) {
        return ApiResponse.success(new Csrf(token.getToken(),token.getHeaderName()),id(request));
    }
    @PostMapping("/api/signup")
    public ResponseEntity<ApiResponse<UserId>> signup(@RequestBody Signup body,HttpServletRequest request) {
        return ResponseEntity.status(201).body(ApiResponse.success(
            new UserId(accounts.signup(body.email(),body.password(),body.nickname())),id(request)));
    }
    @PostMapping("/api/auth/login")
    public ApiResponse<UserId> login(@RequestBody Login body,HttpServletRequest request,HttpServletResponse response) {
        String email=AccountService.email(body.email()); AccountService.password(body.password(),false);
        try {
            var authentication=manager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email,body.password()));
            sessions.onAuthentication(authentication,request,response);
            var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);contexts.saveContext(context,request,response);
            return ApiResponse.success(new UserId(((MemberPrincipal) authentication.getPrincipal()).userId()),id(request));
        } catch (BadCredentialsException error) {
            throw new AccountService.Failure(401,"INVALID_CREDENTIALS","이메일 또는 비밀번호를 확인해 주세요.");
        }
    }
    @GetMapping("/api/auth/me")
    public ApiResponse<Member> me(@AuthenticationPrincipal MemberPrincipal member,HttpServletRequest request) {
        return ApiResponse.success(new Member(member.userId(),member.email(),member.nickname()),id(request));
    }
    @ExceptionHandler(AccountService.Failure.class)
    public ResponseEntity<ApiResponse<Void>> failure(AccountService.Failure error,HttpServletRequest request) {
        return ResponseEntity.status(error.status).body(ApiResponse.failure(error.code,error.getMessage(),id(request)));
    }
    private static String id(HttpServletRequest request) { return (String) request.getAttribute(RequestIdFilter.ATTRIBUTE); }
    public record Signup(String email,String password,String nickname) {}
    public record Login(String email,String password) {}
    public record UserId(UUID userId) {}
    public record Member(UUID userId,String email,String nickname) {}
    public record Csrf(String token,String headerName) {}
}
