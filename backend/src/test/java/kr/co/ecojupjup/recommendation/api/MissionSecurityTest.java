package kr.co.ecojupjup.recommendation.api;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.activity.api.MissionEventController;
import kr.co.ecojupjup.activity.application.MissionEvent;
import kr.co.ecojupjup.activity.application.MissionEventService;
import kr.co.ecojupjup.common.api.ApiExceptionHandler;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.adapter.JdbcAccounts;
import kr.co.ecojupjup.identity.adapter.MemberPrincipal;
import kr.co.ecojupjup.identity.adapter.SessionConfiguration;
import kr.co.ecojupjup.recommendation.application.RecommendationBatch;
import kr.co.ecojupjup.recommendation.application.RecommendationService;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
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

class MissionSecurityTest {
    static final UUID OWNER=UUID.randomUUID(),KEY=UUID.randomUUID(),BATCH=UUID.randomUUID(),ITEM=UUID.randomUUID();
    AnnotationConfigWebApplicationContext context;MockMvc mvc;
    @Configuration @EnableWebMvc @EnableWebSecurity
    @Import({SessionConfiguration.class,RecommendationController.class,MissionEventController.class,ApiExceptionHandler.class})
    static class Config {
        @Bean JdbcAccounts accounts(){return mock(JdbcAccounts.class);}
        @Bean RecommendationService recommendations(){return mock(RecommendationService.class);}
        @Bean MissionEventService events(){return mock(MissionEventService.class);}
        @Bean ObjectMapper mapper(){return new ObjectMapper();}
    }
    @BeforeEach void setup(){context=new AnnotationConfigWebApplicationContext();context.setServletContext(new MockServletContext());context.register(Config.class);context.refresh();mvc=MockMvcBuilders.webAppContextSetup(context).addFilters(new RequestIdFilter()).apply(springSecurity()).build();
        when(context.getBean(RecommendationService.class).create(eq(OWNER),any(),any(),any())).thenReturn(new RecommendationBatch(BATCH,"interest-mapped-catalog-order-v1","catalog_exploration",OffsetDateTime.now(),List.of()));
        when(context.getBean(MissionEventService.class).record(eq(OWNER),any(),any(),any(),any(),any())).thenReturn(new MissionEvent(UUID.randomUUID(),KEY,BATCH,ITEM,"accepted",OffsetDateTime.now(),OffsetDateTime.now()));}
    @AfterEach void close(){context.close();}
    @Test void progressUsesOnlyAuthenticatedOwnerAndIsNotCached() throws Exception {
        var service=context.getBean(MissionEventService.class);
        when(service.progress(OWNER)).thenReturn(new MissionEventService.Progress(1, java.util.List.of(new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p1","a1")), java.util.List.of(new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p2","a2"))));
        mvc.perform(get("/api/missions/events/progress")).andExpect(status().isUnauthorized());
        var principal=new MemberPrincipal(OWNER,"a@example.test","hash","초록이");
        var auth=UsernamePasswordAuthenticationToken.authenticated(principal,null,List.of());
        mvc.perform(get("/api/missions/events/progress?userId="+UUID.randomUUID())
                .header("X-User-Id",UUID.randomUUID()).with(authentication(auth)))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.data.completedMissionCount").value(1))
            .andExpect(jsonPath("$.data.completedMissions[0].programKey").value("p1"))
            .andExpect(jsonPath("$.data.completedMissions[0].actionId").value("a1"))
            .andExpect(jsonPath("$.data.acceptedMissions[0].programKey").value("p2"))
            .andExpect(jsonPath("$.data.acceptedMissions[0].actionId").value("a2"));
        verify(service).progress(OWNER);
    }
    @Test void missionWritesRequireAuthenticationAndCsrf() throws Exception {
        String recommendation="{\"clientRequestId\":\""+KEY+"\",\"mode\":\"general\"}";var principal=new MemberPrincipal(OWNER,"a@example.test","hash","초록이");var auth=UsernamePasswordAuthenticationToken.authenticated(principal,null,List.of());
        mvc.perform(get("/api/missions/recommendations/"+BATCH)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/missions/recommendations").with(authentication(auth)).contentType("application/json").content(recommendation)).andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
        mvc.perform(post("/api/missions/recommendations").with(authentication(auth)).with(csrf()).contentType("application/json").content(recommendation)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(context.getBean(RecommendationService.class)).create(OWNER,KEY,null,"general");
    }
}
