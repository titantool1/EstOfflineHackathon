package kr.co.ecojupjup.activity.application;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.recommendation.application.RecommendationBatch;
import kr.co.ecojupjup.recommendation.application.RecommendationService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MissionEventServiceTest {
    static final UUID OWNER=UUID.randomUUID(),KEY=UUID.randomUUID(),BATCH=UUID.randomUUID(),ITEM=UUID.randomUUID();
    @Test void normalizesNanosecondsAndExactReplayReturnsStoredEvent() {
        var store=mock(MissionEventStore.class);var recommendations=mock(RecommendationService.class);
        when(recommendations.ownedItem(OWNER,BATCH,ITEM)).thenReturn(mock(RecommendationBatch.Item.class));
        var service=new MissionEventService(store,recommendations,Clock.fixed(Instant.parse("2026-09-17T01:00:00.987654321Z"),ZoneOffset.UTC));
        var occurred=OffsetDateTime.parse("2026-09-17T10:00:00.123456789+09:00");
        var created=service.record(OWNER,KEY,BATCH,ITEM,"detail_view",occurred);
        assertEquals(123456000,created.occurredAt().getNano());assertEquals(987654000,created.recordedAt().getNano());
        when(store.findByClientEvent(OWNER,KEY)).thenReturn(Optional.of(created));
        assertSame(created,service.record(OWNER,KEY,BATCH,ITEM,"detail_view",occurred));verify(store,times(1)).save(OWNER,created);
    }
    @Test void nullTypeIsBadRequestAndSecondImpressionConflicts() {
        var store=mock(MissionEventStore.class);var recommendations=mock(RecommendationService.class);
        var service=new MissionEventService(store,recommendations,Clock.systemUTC());
        assertEquals(400,assertThrows(MissionEventException.class,()->service.record(OWNER,KEY,BATCH,ITEM,null,OffsetDateTime.now())).status);
        when(recommendations.ownedItem(OWNER,BATCH,ITEM)).thenReturn(mock(RecommendationBatch.Item.class));when(store.impressionExists(OWNER,BATCH,ITEM)).thenReturn(true);
        assertEquals("IMPRESSION_ALREADY_RECORDED",assertThrows(MissionEventException.class,
                ()->service.record(OWNER,KEY,BATCH,ITEM,"impression",OffsetDateTime.now())).code);
    }
}
