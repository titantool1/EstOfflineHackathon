package kr.co.ecojupjup.profile.api;

import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiExceptionHandler;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.adapter.JdbcAccounts;
import kr.co.ecojupjup.identity.adapter.MemberPrincipal;
import kr.co.ecojupjup.identity.adapter.SessionConfiguration;
import kr.co.ecojupjup.identity.api.AccountController;
import kr.co.ecojupjup.identity.application.AccountService;
import kr.co.ecojupjup.profile.application.InterestProfile;
import kr.co.ecojupjup.profile.application.InterestService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.ObjectMapper;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InterestSecurityTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    AnnotationConfigWebApplicationContext context;
    MockMvc mvc;

    @Configuration @EnableWebMvc @EnableWebSecurity
    @Import({SessionConfiguration.class, AccountController.class, InterestController.class, ApiExceptionHandler.class})
    static class Config {
        @Bean JdbcAccounts accounts() { return mock(JdbcAccounts.class); }
        @Bean AccountService accountsService() { return mock(AccountService.class); }
        @Bean InterestService interests() { return mock(InterestService.class); }
        @Bean ObjectMapper mapper() { return new ObjectMapper(); }
    }

    @BeforeEach void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext()); context.register(Config.class); context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(new RequestIdFilter())
                .apply(springSecurity()).build();
        when(context.getBean(InterestService.class).replace(eq(OWNER), any()))
                .thenReturn(new InterestProfile(List.of(), List.of()));
    }
    @AfterEach void close() { context.close(); }

    @Test void readRequiresAuthenticationAndWriteAlsoRequiresCsrf() throws Exception {
        String body = "{\"interestIds\":[]}";
        var principal = new MemberPrincipal(OWNER, "a@example.test", "hash", "초록이");
        var auth = UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of());
        mvc.perform(get("/api/profile/interests")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/profile/interests").with(authentication(auth))
                        .contentType("application/json").content(body))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
        verify(context.getBean(InterestService.class), never()).replace(any(), any());
        mvc.perform(put("/api/profile/interests").with(authentication(auth)).with(csrf())
                        .contentType("application/json").content(body))
                .andExpect(status().isOk());
        verify(context.getBean(InterestService.class)).replace(OWNER, List.of());
    }
}
