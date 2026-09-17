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
        when(candidates.find(OWNER,List.of("eco-learning"),2)).thenReturn(List.of(new MissionCandidateReader.Candidate(
                "P","A","basis","title","summary","raw",3,List.of("eco-learning"),1)));
        var service=new RecommendationService(store,candidates,interests,Clock.fixed(Instant.parse("2026-09-17T01:02:03.123456789Z"),ZoneOffset.UTC),5);
        var created=service.create(OWNER,KEY,2);
        assertEquals("selected_interests",created.selectionBasis());assertEquals(123456000,created.createdAt().getNano());
        assertEquals("not_evaluated",created.items().getFirst().eligibilityStatus());
        when(store.findByRequest(OWNER,KEY)).thenReturn(Optional.of(
                new RecommendationStore.StoredBatch(2,RecommendationMode.INTERESTS,created)));
        when(interests.get(OWNER)).thenReturn(new InterestProfile(List.of(),List.of("cleanup")));
        assertSame(created,service.create(OWNER,KEY,2,"interests"));
        verify(interests,times(1)).get(OWNER);
        verify(candidates,times(1)).find(eq(OWNER),anyList(),anyInt());
    }
    @Test void unsureExploresCatalogAndChangedLimitConflicts() {
        var store=mock(RecommendationStore.class);var candidates=mock(MissionCandidateReader.class);var interests=mock(InterestService.class);
        when(interests.get(OWNER)).thenReturn(new InterestProfile(List.of(),List.of("unsure")));
        var service=new RecommendationService(store,candidates,interests,Clock.systemUTC(),5);
        var created=service.create(OWNER,KEY,null);assertEquals("catalog_exploration",created.selectionBasis());verify(candidates).find(OWNER,List.of("unsure"),5);
        when(store.findByRequest(OWNER,KEY)).thenReturn(Optional.of(
                new RecommendationStore.StoredBatch(5,RecommendationMode.INTERESTS,created)));
        var error=assertThrows(RecommendationException.class,()->service.create(OWNER,KEY,4));assertEquals("IDEMPOTENCY_CONFLICT",error.code);
    }

    @Test void generalModeExploresWithoutReadingOrChangingInterests() {
        var store=mock(RecommendationStore.class);
        var candidates=mock(MissionCandidateReader.class);
        var interests=mock(InterestService.class);
        when(candidates.find(OWNER,List.of(),3)).thenReturn(List.of(new MissionCandidateReader.Candidate(
                "P","A","basis","title","summary","raw",0,List.of(),0)));
        var service=new RecommendationService(store,candidates,interests,Clock.systemUTC(),5);

        var created=service.create(OWNER,KEY,3,"general");

        assertEquals("catalog_exploration",created.selectionBasis());
        assertEquals(List.of(),created.items().getFirst().matchedInterestIds());
        verifyNoInteractions(interests);
        verify(candidates).find(OWNER,List.of(),3);
        verify(store).save(OWNER,KEY,3,RecommendationMode.GENERAL,created);
    }

    @Test void changingModeConflictsBeforeReadingEvenAnEmptyInterestProfile() {
        var store=mock(RecommendationStore.class);
        var candidates=mock(MissionCandidateReader.class);
        var interests=mock(InterestService.class);
        var saved=new RecommendationBatch(UUID.randomUUID(),RecommendationService.ALGORITHM,
                "catalog_exploration",java.time.OffsetDateTime.now(),List.of());
        when(store.findByRequest(OWNER,KEY)).thenReturn(Optional.of(
                new RecommendationStore.StoredBatch(5,RecommendationMode.INTERESTS,saved)));
        var service=new RecommendationService(store,candidates,interests,Clock.systemUTC(),5);

        var error=assertThrows(RecommendationException.class,()->service.create(OWNER,KEY,null,"general"));

        assertEquals("IDEMPOTENCY_CONFLICT",error.code);
        verifyNoInteractions(interests,candidates);
    }

    @Test void invalidModeIsRejectedWithoutLockingOrReading() {
        var store=mock(RecommendationStore.class);
        var candidates=mock(MissionCandidateReader.class);
        var interests=mock(InterestService.class);
        var service=new RecommendationService(store,candidates,interests,Clock.systemUTC(),5);

        var error=assertThrows(RecommendationException.class,()->service.create(OWNER,KEY,5,"nearby"));

        assertEquals(400,error.status);
        verifyNoInteractions(store,candidates,interests);
    }
}
