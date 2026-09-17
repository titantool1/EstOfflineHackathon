package kr.co.ecojupjup.recommendation.application;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import kr.co.ecojupjup.catalog.application.MissionCandidateReader;
import kr.co.ecojupjup.profile.application.InterestService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecommendationService {
    public static final String ALGORITHM = "interest-mapped-catalog-order-v1";
    private final RecommendationStore store;
    private final MissionCandidateReader candidates;
    private final InterestService interests;
    private final Clock clock;
    private final int defaultSize;

    @org.springframework.beans.factory.annotation.Autowired
    public RecommendationService(RecommendationStore store, MissionCandidateReader candidates,
            InterestService interests, @Value("${eco.missions.default-size:5}") int defaultSize) {
        this(store,candidates,interests,Clock.systemUTC(),defaultSize);
    }
    RecommendationService(RecommendationStore store, MissionCandidateReader candidates,
            InterestService interests, Clock clock, int defaultSize) {
        if (defaultSize < 1 || defaultSize > 20) throw new IllegalArgumentException("invalid mission default size");
        this.store=store; this.candidates=candidates; this.interests=interests; this.clock=clock; this.defaultSize=defaultSize;
    }

    @Transactional
    public RecommendationBatch create(UUID owner, UUID clientRequestId, Integer requestedLimit) {
        Objects.requireNonNull(owner); Objects.requireNonNull(clientRequestId);
        int limit=requestedLimit == null ? defaultSize : requestedLimit;
        if (limit < 1 || limit > 20) throw new RecommendationException(400,"INVALID_RECOMMENDATION_REQUEST");
        store.lockOwner(owner);
        var prior=store.findByRequest(owner,clientRequestId);
        if (prior.isPresent()) {
            if (prior.get().requestedLimit()!=limit) throw new RecommendationException(409,"IDEMPOTENCY_CONFLICT");
            return prior.get().batch();
        }
        List<String> selected=interests.get(owner).interestIds();
        boolean exploration=selected.isEmpty() || selected.contains("unsure");
        var source=candidates.find(selected,limit);
        UUID batchId=UUID.randomUUID();
        var items=java.util.stream.IntStream.range(0,source.size()).mapToObj(position -> {
            var c=source.get(position);
            return new RecommendationBatch.Item(UUID.randomUUID(),position,c.programKey(),c.actionId(),c.identityBasis(),
                c.programTitle(),c.programSummary(),c.programStatusRaw(),c.conditionCount(),List.copyOf(c.matchedInterestIds()),
                "not_evaluated","unknown",c.relatedPlaceCount());
        }).toList();
        var result=new RecommendationBatch(batchId,ALGORITHM,exploration?"catalog_exploration":"selected_interests",
                OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS),items);
        store.save(owner,clientRequestId,limit,result);
        return result;
    }

    @Transactional(readOnly=true)
    public RecommendationBatch get(UUID owner, UUID batchId) {
        return store.find(owner,batchId).orElseThrow(() -> new RecommendationException(404,"RESOURCE_NOT_FOUND"));
    }

    @Transactional(readOnly=true)
    public RecommendationBatch.Item ownedItem(UUID owner, UUID batchId, UUID itemId) {
        return get(owner,batchId).items().stream().filter(item -> item.itemId().equals(itemId)).findFirst()
                .orElseThrow(() -> new RecommendationException(404,"RESOURCE_NOT_FOUND"));
    }
}
