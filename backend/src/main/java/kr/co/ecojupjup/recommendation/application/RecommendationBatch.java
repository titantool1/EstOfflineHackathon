package kr.co.ecojupjup.recommendation.application;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record RecommendationBatch(UUID batchId, String algorithmVersion, String selectionBasis,
        OffsetDateTime createdAt, List<Item> items) {
    public record Item(UUID itemId, int position, String programKey, String actionId,
            String identityBasis, String programTitle, String programSummary, String programStatusRaw,
            int conditionCount, List<String> matchedInterestIds, String eligibilityStatus,
            String locationStatus, int relatedPlaceCount) {}
}
