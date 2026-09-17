package kr.co.ecojupjup.profile.api;

import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.common.api.ApiExceptionHandler;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.profile.application.InterestProfile;
import kr.co.ecojupjup.profile.application.InterestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InterestControllerTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final InterestProfile PROFILE = new InterestProfile(List.of(
            new InterestProfile.Option("eco-learning", "환경 체험·배우기", "교육·체험·기후행동"),
            new InterestProfile.Option("unsure", "아직 잘 모르겠어요", "분야별 추천")), List.of("eco-learning"));
    InterestService.Store store;
    MockMvc mvc;

    @BeforeEach void setup() {
        store = mock(InterestService.Store.class);
        when(store.findOptions()).thenReturn(PROFILE.options());
        mvc = MockMvcBuilders.standaloneSetup(new InterestController(new InterestService(store)))
                .setControllerAdvice(new ApiExceptionHandler()).addFilters(new RequestIdFilter()).build();
    }

    @Test void getUsesOnlyTheAuthenticatedOwnerAndReturnsCatalogOptions() throws Exception {
        when(store.findInterestIds(OWNER)).thenReturn(PROFILE.interestIds());
        mvc.perform(get("/api/profile/interests").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                        .param("userId", UUID.randomUUID().toString()).header("X-User-Id", UUID.randomUUID()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data.options[0].id").value("eco-learning"))
                .andExpect(jsonPath("$.data.interestIds[0]").value("eco-learning"));
        verify(store).findInterestIds(OWNER);
    }

    @Test void putReplacesTheAuthenticatedOwnersWholeSelection() throws Exception {
        mvc.perform(put("/api/profile/interests").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                        .param("userId", UUID.randomUUID().toString()).header("X-User-Id", UUID.randomUUID())
                        .contentType("application/json").content("{\"interestIds\":[\"eco-learning\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.interestIds[0]").value("eco-learning"));
        verify(store).lockOwner(OWNER);
        verify(store).replace(OWNER, List.of("eco-learning"));
    }

    @Test void unauthenticatedMalformedDuplicateAndUnknownInputsDoNotReplace() throws Exception {
        mvc.perform(get("/api/profile/interests")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/profile/interests").contentType("application/json")
                        .content("{\"interestIds\":[]}"))
                .andExpect(status().isUnauthorized());
        for (String body : List.of(
                "{\"interestIds\":[\"eco-learning\",\"eco-learning\"]}",
                "{\"interestIds\":[\"missing\"]}",
                "{\"interestIds\":[1]}",
                "{\"interestIds\":null}")) {
            mvc.perform(put("/api/profile/interests").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                            .contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        }
        verify(store, never()).replace(any(), any());
    }
}
