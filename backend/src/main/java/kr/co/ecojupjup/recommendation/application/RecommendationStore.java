package kr.co.ecojupjup.recommendation.application;

import java.util.Optional;
import java.util.UUID;

public interface RecommendationStore {
    void lockOwner(UUID owner);
    Optional<StoredBatch> findByRequest(UUID owner, UUID clientRequestId);
    Optional<RecommendationBatch> find(UUID owner, UUID batchId);
    void save(UUID owner, UUID clientRequestId, int requestedLimit, RecommendationMode requestMode,
            RecommendationBatch batch);

    record StoredBatch(int requestedLimit, RecommendationMode requestMode, RecommendationBatch batch) {}
}
