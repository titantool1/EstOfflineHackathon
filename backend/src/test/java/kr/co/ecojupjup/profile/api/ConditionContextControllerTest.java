package kr.co.ecojupjup.profile.api;

import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiExceptionHandler;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.profile.application.ConditionContext;
import kr.co.ecojupjup.profile.application.ConditionContextService;
import kr.co.ecojupjup.profile.application.ConditionContextService.Selection;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ConditionContextControllerTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    ConditionContextService.Lookup lookup;
    MockMvc mvc;
    @BeforeEach void setup() {
        lookup = mock(ConditionContextService.Lookup.class);
        mvc = MockMvcBuilders.standaloneSetup(new ConditionContextController(new ConditionContextService(lookup)))
                .setControllerAdvice(new ApiExceptionHandler()).addFilters(new RequestIdFilter()).build();
    }
    @Test void noMemberContextNeverAcceptsAnOwnerHeaderOrQuery() throws Exception {
        mvc.perform(get("/api/profile/condition-context").param("programKey","scheme:G031").param("actionId","G031-A01")
                .param("userId",OWNER.toString()).header("X-User-Id",OWNER.toString()))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("AUTHENTICATION_REQUIRED"));
        verifyNoInteractions(lookup);
    }
    @Test void memberContextOwnsTheLookupAndPreservesRequestId() throws Exception {
        var selection = new Selection("scheme:G031","G031-A01",null,null,null);
        when(lookup.load(OWNER,selection)).thenReturn(new ConditionContext(OWNER,"scheme:G031","G031-A01",
                List.of(),List.of(),List.of("unmapped"),List.of(),"not_evaluated"));
        mvc.perform(get("/api/profile/condition-context").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                .param("programKey","scheme:G031").param("actionId","G031-A01").param("userId",UUID.randomUUID().toString())
                .header("X-Request-Id","context-test"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.userId").value(OWNER.toString()))
                .andExpect(jsonPath("$.data.eligibilityStatus").value("not_evaluated"))
                .andExpect(jsonPath("$.data.unmappedConditionIds[0]").value("unmapped"))
                .andExpect(header().string("X-Request-Id","context-test"))
                .andExpect(header().string("Cache-Control","no-store"));
        verify(lookup).load(OWNER,selection);
    }
    @Test void invalidMemberContextAndInvalidSelectionDoNotQuery() throws Exception {
        mvc.perform(get("/api/profile/condition-context").requestAttr(MemberRequestContext.ATTRIBUTE, "not-a-uuid")
                .param("programKey","scheme:G031").param("actionId","G031-A01"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profile/condition-context").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                .param("programKey"," ").param("actionId","G031-A01"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/profile/condition-context").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                .param("programKey","scheme:G031").param("actionId","G031-A01").param("homeId","bad"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(lookup);
    }
    @Test void missingOrUnownedContextIs404AndConnectionFailureIs503() throws Exception {
        when(lookup.load(any(),any())).thenThrow(new ConditionContextService.NotFound());
        mvc.perform(get("/api/profile/condition-context").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                .param("programKey","scheme:G031").param("actionId","G031-A01"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("CONDITION_CONTEXT_NOT_FOUND"));
        doThrow(new DataAccessResourceFailureException("private SQL password=secret")).when(lookup).load(any(),any());
        mvc.perform(get("/api/profile/condition-context").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                .param("programKey","scheme:G031").param("actionId","G031-A01"))
                .andExpect(status().isServiceUnavailable()).andExpect(content().string(not(containsString("password"))));
    }
}
