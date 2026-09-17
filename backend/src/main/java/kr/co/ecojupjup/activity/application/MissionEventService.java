package kr.co.ecojupjup.activity.application;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Set;
import java.util.UUID;
import kr.co.ecojupjup.recommendation.application.RecommendationException;
import kr.co.ecojupjup.recommendation.application.RecommendationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MissionEventService {
    private static final Set<String> TYPES=Set.of("impression","detail_view","accepted","self_reported_completed","map_open","route_open");
    private final MissionEventStore store; private final RecommendationService recommendations; private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public MissionEventService(MissionEventStore store,RecommendationService recommendations) { this(store,recommendations,Clock.systemUTC()); }
    MissionEventService(MissionEventStore store,RecommendationService recommendations,Clock clock) { this.store=store;this.recommendations=recommendations;this.clock=clock; }

    @Transactional(readOnly=true) public Progress progress(UUID owner) {
        if (owner==null) throw new MissionEventException(401,"AUTHENTICATION_REQUIRED");
        return new Progress(store.completedMissionCount(owner));
    }
    public record Progress(long completedMissionCount) {}

    @Transactional public MissionEvent record(UUID owner,UUID clientEventId,UUID batchId,UUID itemId,String eventType,OffsetDateTime occurredAt) {
        if (owner==null || clientEventId==null || batchId==null || itemId==null || occurredAt==null
                || eventType==null || !TYPES.contains(eventType))
            throw new MissionEventException(400,"INVALID_MISSION_EVENT");
        OffsetDateTime normalized=occurredAt.withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
        store.lockOwner(owner);
        var prior=store.findByClientEvent(owner,clientEventId);
        if (prior.isPresent()) {
            var value=prior.get();
            if (!value.batchId().equals(batchId) || !value.itemId().equals(itemId) || !value.eventType().equals(eventType)
                    || !value.occurredAt().toInstant().equals(normalized.toInstant()))
                throw new MissionEventException(409,"IDEMPOTENCY_CONFLICT");
            return value;
        }
        try { recommendations.ownedItem(owner,batchId,itemId); }
        catch (RecommendationException error) { throw new MissionEventException(404,"RESOURCE_NOT_FOUND"); }
        if (eventType.equals("impression") && store.impressionExists(owner,batchId,itemId))
            throw new MissionEventException(409,"IMPRESSION_ALREADY_RECORDED");
        var result=new MissionEvent(UUID.randomUUID(),clientEventId,batchId,itemId,eventType,normalized,
                OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS));
        store.save(owner,result); return result;
    }
}
