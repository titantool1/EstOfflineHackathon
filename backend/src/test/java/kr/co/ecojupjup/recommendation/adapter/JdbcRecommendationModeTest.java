package kr.co.ecojupjup.recommendation.adapter;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import kr.co.ecojupjup.recommendation.application.RecommendationBatch;
import kr.co.ecojupjup.recommendation.application.RecommendationMode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.*;

class JdbcRecommendationModeTest {
    @Test void savesRequestModeWithTheBatchIntent() {
        var jdbc=mock(JdbcTemplate.class);
        var store=new JdbcRecommendationStore(jdbc);
        var owner=UUID.randomUUID();
        var request=UUID.randomUUID();
        var batch=new RecommendationBatch(UUID.randomUUID(),"interest-mapped-catalog-order-v1",
                "catalog_exploration",OffsetDateTime.now(),List.of());

        store.save(owner,request,5,RecommendationMode.GENERAL,batch);

        var values=ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("request_mode"),values.capture());
        assertArrayEquals(new Object[]{batch.batchId(),owner,request,5,"general",batch.algorithmVersion(),
                batch.selectionBasis(),batch.createdAt()},values.getValue());
    }
}
