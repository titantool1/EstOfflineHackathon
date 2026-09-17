package kr.co.ecojupjup.recommendation.application;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.catalog.application.MissionCandidateReader;
import kr.co.ecojupjup.profile.application.InterestProfile;
import kr.co.ecojupjup.profile.application.InterestService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RecommendationServiceTest {
    static final UUID OWNER=UUID.randomUUID(), KEY=UUID.randomUUID();
    @Test void selectedInterestsProduceOrderedSnapshotAndSameKeyReplaysIt() {
        var store=mock(RecommendationStore.class);var candidates=mock(MissionCandidateReader.class);var interests=mock(InterestService.class);
        when(interests.get(OWNER)).thenReturn(new InterestProfile(List.of(),List.of("eco-learning")));
        when(candidates.find(List.of("eco-learning"),2)).thenReturn(List.of(new MissionCandidateReader.Candidate(
                "P","A","basis","title","summary","raw",3,List.of("eco-learning"),1)));
        var service=new RecommendationService(store,candidates,interests,Clock.fixed(Instant.parse("2026-09-17T01:02:03.123456789Z"),ZoneOffset.UTC),5);
        var created=service.create(OWNER,KEY,2);
        assertEquals("selected_interests",created.selectionBasis());assertEquals(123456000,created.createdAt().getNano());
        assertEquals("not_evaluated",created.items().getFirst().eligibilityStatus());
        when(store.findByRequest(OWNER,KEY)).thenReturn(Optional.of(new RecommendationStore.StoredBatch(2,created)));
        assertSame(created,service.create(OWNER,KEY,2));
        verify(candidates,times(1)).find(anyList(),anyInt());
    }
    @Test void unsureExploresCatalogAndChangedLimitConflicts() {
        var store=mock(RecommendationStore.class);var candidates=mock(MissionCandidateReader.class);var interests=mock(InterestService.class);
        when(interests.get(OWNER)).thenReturn(new InterestProfile(List.of(),List.of("unsure")));
        var service=new RecommendationService(store,candidates,interests,Clock.systemUTC(),5);
        var created=service.create(OWNER,KEY,null);assertEquals("catalog_exploration",created.selectionBasis());verify(candidates).find(List.of("unsure"),5);
        when(store.findByRequest(OWNER,KEY)).thenReturn(Optional.of(new RecommendationStore.StoredBatch(5,created)));
        var error=assertThrows(RecommendationException.class,()->service.create(OWNER,KEY,4));assertEquals("IDEMPOTENCY_CONFLICT",error.code);
    }
}
