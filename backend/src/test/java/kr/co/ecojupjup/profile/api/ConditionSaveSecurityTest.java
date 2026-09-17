package kr.co.ecojupjup.profile.api;

import java.util.*;
import kr.co.ecojupjup.common.api.*;import kr.co.ecojupjup.identity.adapter.*;import kr.co.ecojupjup.identity.api.AccountController;import kr.co.ecojupjup.identity.application.*;import kr.co.ecojupjup.profile.application.ConditionSaveService;
import org.junit.jupiter.api.*;import org.springframework.context.annotation.*;import org.springframework.mock.web.MockServletContext;import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;import org.springframework.test.web.servlet.*;import org.springframework.test.web.servlet.setup.MockMvcBuilders;import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;import org.springframework.web.servlet.config.annotation.EnableWebMvc;import tools.jackson.databind.ObjectMapper;
import static org.mockito.Mockito.*;import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ConditionSaveSecurityTest {
 static final UUID OWNER=UUID.fromString("00000000-0000-4000-8000-000000000001");AnnotationConfigWebApplicationContext context;MockMvc mvc;
 @Configuration @EnableWebMvc @EnableWebSecurity @Import({SessionConfiguration.class,AccountController.class,ConditionSaveController.class,ApiExceptionHandler.class}) static class Config{
  @Bean JdbcAccounts accounts(){return mock(JdbcAccounts.class);}@Bean AccountService accountsService(){return mock(AccountService.class);}@Bean ConditionSaveService conditionSaves(){return mock(ConditionSaveService.class);}@Bean ObjectMapper mapper(){return new ObjectMapper();}
 }
 @BeforeEach void setup(){context=new AnnotationConfigWebApplicationContext();context.setServletContext(new MockServletContext());context.register(Config.class);context.refresh();mvc=MockMvcBuilders.webAppContextSetup(context).addFilters(new RequestIdFilter()).apply(springSecurity()).build();}
 @AfterEach void close(){context.close();}
 @Test void endpointRequiresAuthenticationAndCsrf()throws Exception{
  var principal=new MemberPrincipal(OWNER,"a@example.test","hash","초록이");var auth=UsernamePasswordAuthenticationToken.authenticated(principal,null,List.of());
  mvc.perform(post("/api/profile/condition-save").with(csrf()).contentType("application/json").content("{}")) .andExpect(status().isUnauthorized());
  mvc.perform(post("/api/profile/condition-save").with(authentication(auth)).contentType("application/json").content("{}")) .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
  verifyNoInteractions(context.getBean(ConditionSaveService.class));
  mvc.perform(post("/api/profile/condition-save").with(authentication(auth)).with(csrf()).contentType("application/json").content("{}")) .andExpect(status().isBadRequest());
 }
}
