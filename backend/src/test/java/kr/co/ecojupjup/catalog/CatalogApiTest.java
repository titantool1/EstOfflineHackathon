package kr.co.ecojupjup.catalog;

import kr.co.ecojupjup.catalog.api.CatalogController;
import kr.co.ecojupjup.catalog.application.*;
import kr.co.ecojupjup.common.api.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CatalogApiTest {
    CatalogReader reader;
    MockMvc mvc;
    final JsonMapper json = new JsonMapper();
    @BeforeEach void setup() {
        reader = mock(CatalogReader.class);
        mvc = MockMvcBuilders.standaloneSetup(new CatalogController(new CatalogService(reader)))
            .setControllerAdvice(new ApiExceptionHandler()).addFilters(new RequestIdFilter()).build();
    }
    @Test void searchKeepsEmptySuccessDistinctFromFailure() throws Exception {
        when(reader.search(any())).thenReturn(json.readTree("{\"items\":[],\"has_more\":false}"));
        mvc.perform(get("/api/catalog/actions").param("query", "등록안된항목").header("X-Request-Id", "catalog-1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.items", hasSize(0)))
            .andExpect(jsonPath("$.error").value(nullValue()))
            .andExpect(jsonPath("$.requestId").value("catalog-1"));
    }
    @Test void rejectsInvalidQueriesBeforeDatabase() throws Exception {
        for (String q : new String[]{" ", "x".repeat(201), "a b c d e f g h i"})
            mvc.perform(get("/api/catalog/actions").param("query", q)).andExpect(status().isBadRequest());
        for (String limit : new String[]{"0", "21", "invalid"})
            mvc.perform(get("/api/catalog/actions").param("query", "컵").param("limit", limit)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/catalog/actions").param("query", "컵").param("offset", "-1")).andExpect(status().isBadRequest());
        verifyNoInteractions(reader);
    }
    @Test void parsesKeywordsWithoutReinterpretingWildcards() {
        var q = CatalogQuery.parse("  컵  %_'  컵 ", 3, 4);
        assertEquals(java.util.List.of("컵", "%_'"), q.terms());
        assertEquals(4, q.offset());
    }
    @Test void missingActionIs404RatherThanEmptySuccessfulDetail() throws Exception {
        mvc.perform(get("/api/catalog/actions/detail").param("programKey", "missing").param("actionId", "A01"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("CATALOG_ACTION_NOT_FOUND"));
    }
    @Test void detailPreservesUnknownAndFalseWithoutEligibilityInference() throws Exception {
        when(reader.detail("P", "A")).thenReturn(json.readTree("{\"eligibility_status\":\"not_evaluated\",\"conditions\":[{\"value\":false,\"verification\":\"미확인\"}],\"places\":[{\"status\":\"closed\"}]}"));
        mvc.perform(get("/api/catalog/actions/detail").param("programKey", "P").param("actionId", "A"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.conditions[0].value").value(false))
            .andExpect(jsonPath("$.data.eligibility_status").value("not_evaluated"))
            .andExpect(jsonPath("$.data.places[0].status").value("closed"));
    }
    @Test void rejectsMissingOrInvalidIds() throws Exception {
        mvc.perform(get("/api/catalog/actions/detail").param("programKey", "P")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/catalog/actions/detail").param("programKey", " P ").param("actionId", "A")).andExpect(status().isBadRequest());
        verifyNoInteractions(reader);
    }
    @Test void databaseFailureDoesNotBecomeNoResults() throws Exception {
        when(reader.search(any())).thenThrow(new DataAccessResourceFailureException("secret database details"));
        mvc.perform(get("/api/catalog/actions").param("query", "컵"))
            .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error.code").value("DATABASE_UNAVAILABLE"))
            .andExpect(content().string(not(containsString("secret"))));
    }
    @Test void methodErrorKeepsHttpStatus() throws Exception {
        mvc.perform(post("/api/catalog/actions")).andExpect(status().isMethodNotAllowed());
        verifyNoInteractions(reader);
    }
}
