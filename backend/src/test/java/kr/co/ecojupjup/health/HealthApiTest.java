package kr.co.ecojupjup.health;

import kr.co.ecojupjup.common.api.ApiExceptionHandler;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.health.api.HealthController;
import kr.co.ecojupjup.health.application.DatabaseProbe;
import kr.co.ecojupjup.health.application.HealthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class HealthApiTest {
    private DatabaseProbe database;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        database = mock(DatabaseProbe.class);
        mvc = MockMvcBuilders.standaloneSetup(new HealthController(new HealthService(database)))
                .setControllerAdvice(new ApiExceptionHandler()).addFilters(new RequestIdFilter()).build();
    }

    @Test
    void reportsDatabaseSuccessAndPreservesCorrelation() throws Exception {
        mvc.perform(get("/api/health").header("X-Request-Id", "health-check-1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.database").value("UP"))
                .andExpect(jsonPath("$.error").value(nullValue()))
                .andExpect(jsonPath("$.requestId").value("health-check-1"))
                .andExpect(header().string("X-Request-Id", "health-check-1"));
        verify(database).verifyConnection();
    }

    @Test
    void databaseFailureIsNotSuccessAndDoesNotExposeDetails() throws Exception {
        doThrow(new DataAccessResourceFailureException("jdbc:postgresql://private password=secret"))
                .when(database).verifyConnection();
        mvc.perform(get("/api/health"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("DATABASE_UNAVAILABLE"))
                .andExpect(jsonPath("$.data").value(nullValue()))
                .andExpect(content().string(not(containsString("password"))));
    }

    @Test
    void replacesUntrustedRequestId() throws Exception {
        mvc.perform(get("/api/health").header("X-Request-Id", "bad id"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Request-Id", matchesPattern("[a-f0-9-]{36}")));
    }

    @Test
    void preservesMethodErrorInsteadOfTurningItInto500() throws Exception {
        mvc.perform(post("/api/health"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.error.code").value("HTTP_405"));
        verifyNoInteractions(database);
    }
}
