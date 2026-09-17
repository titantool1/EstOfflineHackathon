package kr.co.ecojupjup.profile.api;

import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.identity.application.MemberRequestContext;
import kr.co.ecojupjup.common.api.ApiExceptionHandler;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.profile.application.Neighborhood;
import kr.co.ecojupjup.profile.application.NeighborhoodService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class NeighborhoodControllerTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final Neighborhood NEIGHBORHOOD = new Neighborhood("1230059000", "전남광주통합특별시", "북구", "용봉동");
    NeighborhoodService.Store store;
    MockMvc mvc;

    @BeforeEach void setup() {
        store = mock(NeighborhoodService.Store.class);
        mvc = MockMvcBuilders.standaloneSetup(new NeighborhoodController(new NeighborhoodService(store)))
                .setControllerAdvice(new ApiExceptionHandler()).addFilters(new RequestIdFilter()).build();
    }

    @Test void missingSelectionIsExplicitNullAndOwnerComesOnlyFromSessionContext() throws Exception {
        when(store.find(OWNER)).thenReturn(Optional.empty());
        mvc.perform(get("/api/profile/neighborhood").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                        .param("userId", UUID.randomUUID().toString()).header("X-User-Id", UUID.randomUUID()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.neighborhood").isEmpty())
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(store).find(OWNER);
    }

    @Test void savesAndReloadsTheAuthenticatedOwnersSelection() throws Exception {
        String body = "{\"regionCode\":\"1230059000\",\"sido\":\"전남광주통합특별시\",\"sigungu\":\"북구\",\"dong\":\"용봉동\"}";
        mvc.perform(put("/api/profile/neighborhood").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                        .contentType("application/json").content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.neighborhood.regionCode").value("1230059000"))
                .andExpect(jsonPath("$.data.neighborhood.dong").value("용봉동"));
        verify(store).save(OWNER, NEIGHBORHOOD);
        when(store.find(OWNER)).thenReturn(Optional.of(NEIGHBORHOOD));
        mvc.perform(get("/api/profile/neighborhood").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.neighborhood.sido").value("전남광주통합특별시"));
    }

    @Test void unauthenticatedAndInvalidValuesNeverReachStorage() throws Exception {
        String valid = "{\"regionCode\":\"1230059000\",\"sido\":\"서울특별시\",\"sigungu\":\"\",\"dong\":\"종로1가동\"}";
        mvc.perform(get("/api/profile/neighborhood")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("AUTHENTICATION_REQUIRED"));
        mvc.perform(put("/api/profile/neighborhood").contentType("application/json").content(valid))
                .andExpect(status().isUnauthorized());
        mvc.perform(put("/api/profile/neighborhood").requestAttr(MemberRequestContext.ATTRIBUTE, OWNER)
                        .contentType("application/json").content(valid.replace("1230059000", "bad")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_NEIGHBORHOOD"));
        verifyNoInteractions(store);
    }
}
