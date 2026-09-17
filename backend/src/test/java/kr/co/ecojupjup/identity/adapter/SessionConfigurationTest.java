package kr.co.ecojupjup.identity.adapter;

import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.common.api.*;
import kr.co.ecojupjup.identity.api.AccountController;
import kr.co.ecojupjup.identity.application.AccountService;
import kr.co.ecojupjup.profile.api.ConditionContextController;
import kr.co.ecojupjup.profile.application.*;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import tools.jackson.databind.ObjectMapper;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SessionConfigurationTest {
    static final UUID OWNER=UUID.fromString("00000000-0000-4000-8000-000000000001");
    AnnotationConfigWebApplicationContext context;
    MockMvc mvc;
    @Configuration @EnableWebMvc @EnableWebSecurity
    @Import({SessionConfiguration.class,AccountController.class,ConditionContextController.class,ApiExceptionHandler.class})
    static class Config {
        @Bean JdbcAccounts accounts() { return mock(JdbcAccounts.class); }
        @Bean AccountService service() { return mock(AccountService.class); }
        @Bean ConditionContextService conditions() { return mock(ConditionContextService.class); }
        @Bean ObjectMapper mapper() { return new ObjectMapper(); }
    }
    @BeforeEach void setup() {
        context=new AnnotationConfigWebApplicationContext();context.setServletContext(new MockServletContext());
        context.register(Config.class);context.refresh();
        mvc=MockMvcBuilders.webAppContextSetup(context).addFilters(new RequestIdFilter()).apply(springSecurity()).build();
    }
    @AfterEach void close() { context.close(); }
    @Test void signupAllowsMissingNicknameAndRequiresCsrf() throws Exception {
        var service=context.getBean(AccountService.class);
        when(service.signup("a@example.test","password123",null)).thenReturn(OWNER);
        String body="{\"email\":\"a@example.test\",\"password\":\"password123\"}";
        mvc.perform(post("/api/signup").contentType("application/json").content(body))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"))
            .andExpect(jsonPath("$.requestId").isNotEmpty());
        verifyNoInteractions(service);
        mvc.perform(post("/api/signup").with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.userId").value(OWNER.toString()));
        verify(service).signup("a@example.test","password123",null);
    }
    @Test void sessionPrincipalExposesNicknameAndOwnsPersonalLookup() throws Exception {
        var principal=new MemberPrincipal(OWNER,"a@example.test","hash","에코쭙123456");
        var auth=UsernamePasswordAuthenticationToken.authenticated(principal,null,List.of());
        mvc.perform(get("/api/auth/me").with(authentication(auth))).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.nickname").value("에코쭙123456"))
            .andExpect(jsonPath("$.data.password").doesNotExist());
        var selection=new ConditionContextService.Selection("scheme:G031","G031-A01",null,null,null);
        var service=context.getBean(ConditionContextService.class);
        when(service.load(OWNER,selection)).thenReturn(new ConditionContext(OWNER,"scheme:G031","G031-A01",
            List.of(),List.of(),List.of(),List.of(),"not_evaluated"));
        mvc.perform(get("/api/profile/condition-context").with(authentication(auth))
            .param("programKey","scheme:G031").param("actionId","G031-A01")
            .header("X-User-Id",UUID.randomUUID().toString()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.userId").value(OWNER.toString()));
        verify(service).load(OWNER,selection);
    }
    @Test void existingLoginFlowSavesTheSessionAndLogoutClearsIt() throws Exception {
        var encoder=context.getBean(org.springframework.security.crypto.password.PasswordEncoder.class);
        var principal=new MemberPrincipal(OWNER,"a@example.test",encoder.encode("password123"),"초록이");
        when(context.getBean(JdbcAccounts.class).findByEmail("a@example.test"))
            .thenReturn(java.util.Optional.of(principal));
        var session=new org.springframework.mock.web.MockHttpSession();
        mvc.perform(post("/api/auth/login").session(session).with(csrf()).contentType("application/json")
            .content("{\"email\":\"A@example.test\",\"password\":\"password123\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.userId").value(OWNER.toString()));
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.nickname").value("초록이"));
        mvc.perform(post("/api/auth/logout").session(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.loggedOut").value(true));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }
    @Test void anonymousPersonalLookupIsBlockedWhilePublicCatalogRemainsReachable() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile/condition-context").param("programKey","scheme:G031").param("actionId","G031-A01"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(context.getBean(ConditionContextService.class));
        mvc.perform(get("/api/catalog/not-a-route")).andExpect(status().isNotFound());
        mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.headerName").value("X-CSRF-TOKEN"));
    }
}
