package kr.co.ecojupjup.places;

import kr.co.ecojupjup.places.api.PlaceController;
import kr.co.ecojupjup.places.application.*;
import kr.co.ecojupjup.common.api.*;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

class PlaceApiTest {
    final PlaceReader reader = mock(PlaceReader.class);
    final org.springframework.test.web.servlet.MockMvc mvc = MockMvcBuilders.standaloneSetup(new PlaceController(reader))
        .setControllerAdvice(new ApiExceptionHandler()).addFilters(new RequestIdFilter()).build();
    @Test void noResultsIsSuccessfulEnvelope() throws Exception {
        when(reader.search(any())).thenReturn(new JsonMapper().readTree("{\"results\":[],\"meta\":{\"resultCount\":0,\"tookMs\":1}}"));
        mvc.perform(get("/api/places")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.results",hasSize(0))).andExpect(jsonPath("$.error",nullValue()));
    }
    @Test void rejectsInvalidInputsBeforeDatabase() throws Exception {
        for (String value : new String[]{"NaN","Infinity","91","-91","invalid"})
            mvc.perform(get("/api/places").param("latitude",value)).andExpect(status().isBadRequest());
        for (String value : new String[]{"0","101","NaN"})
            mvc.perform(get("/api/places").param("distanceKm",value)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/places").param("query","a".repeat(201))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/places").param("region","a".repeat(51))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/places").param("district","x".repeat(81))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/places").param("district","중구").param("region", " ")).andExpect(status().isBadRequest());
        verifyNoInteractions(reader);
    }
    @Test void databaseFailureIsNotEmptySuccess() throws Exception {
        when(reader.search(any())).thenThrow(new DataAccessResourceFailureException("private-password"));
        mvc.perform(get("/api/places")).andExpect(status().isServiceUnavailable())
            .andExpect(content().string(not(containsString("private-password"))));
    }
}
