package kr.co.ecojupjup.identity.adapter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.profile.api.ConditionContextController;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.session.*;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.*;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

@Configuration
public class SessionConfiguration {
    @Bean PasswordEncoder passwordEncoder() { return PasswordEncoderFactories.createDelegatingPasswordEncoder(); }
    @Bean UserDetailsService users(JdbcAccounts accounts) {
        return email -> accounts.findByEmail(email).orElseThrow(() -> new UsernameNotFoundException(email));
    }
    @Bean AuthenticationManager authenticationManager(UserDetailsService users,PasswordEncoder encoder) {
        var provider=new DaoAuthenticationProvider(users);provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }
    @Bean SecurityContextRepository contexts() { return new HttpSessionSecurityContextRepository(); }
    @Bean HttpSessionCsrfTokenRepository csrfTokens() { return new HttpSessionCsrfTokenRepository(); }
    @Bean SessionAuthenticationStrategy sessions(HttpSessionCsrfTokenRepository tokens) {
        return new CompositeSessionAuthenticationStrategy(java.util.List.of(
            new ChangeSessionIdAuthenticationStrategy(),new CsrfAuthenticationStrategy(tokens)));
    }
    @Bean SecurityFilterChain security(HttpSecurity http, SecurityContextRepository contexts,
            HttpSessionCsrfTokenRepository tokens,ObjectMapper mapper) throws Exception {
        return http.formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
            .requestCache(cache -> cache.disable())
            .securityContext(context -> context.requireExplicitSave(true).securityContextRepository(contexts))
            .csrf(csrf -> csrf.csrfTokenRepository(tokens).csrfTokenRequestHandler(new XorCsrfTokenRequestAttributeHandler()))
            .authorizeHttpRequests(auth -> auth.requestMatchers("/api/auth/me","/api/profile/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request,response,error) -> failure(request,response,mapper,401,"AUTHENTICATION_REQUIRED","로그인이 필요합니다."))
                .accessDeniedHandler((request,response,error) -> failure(request,response,mapper,403,"CSRF_INVALID","요청 정보를 다시 받아 주세요.")))
            .addFilterBefore(new MemberContextFilter(),AuthorizationFilter.class)
            .logout(logout -> logout.logoutUrl("/api/auth/logout").deleteCookies("ECOTEAMSESSION")
                .logoutSuccessHandler((request,response,auth) -> {
                    response.setContentType("application/json");
                    mapper.writeValue(response.getOutputStream(),ApiResponse.success(java.util.Map.of("loggedOut",true),
                        (String)request.getAttribute(RequestIdFilter.ATTRIBUTE)));
                }))
            .build();
    }
    private static void failure(HttpServletRequest request,HttpServletResponse response,ObjectMapper mapper,
            int status,String code,String message) throws IOException {
        response.setStatus(status);response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(),ApiResponse.failure(code,message,
            (String)request.getAttribute(RequestIdFilter.ATTRIBUTE)));
    }
    static class MemberContextFilter extends OncePerRequestFilter {
        @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)
                throws ServletException,IOException {
            request.removeAttribute(ConditionContextController.CURRENT_USER_ID);
            var auth=SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof MemberPrincipal member)
                request.setAttribute(ConditionContextController.CURRENT_USER_ID,member.userId());
            chain.doFilter(request,response);
        }
    }
}
