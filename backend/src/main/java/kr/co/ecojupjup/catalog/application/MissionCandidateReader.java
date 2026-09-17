package kr.co.ecojupjup.catalog.application;

import java.util.List;
import java.util.UUID;

public interface MissionCandidateReader {
    List<Candidate> find(UUID owner, List<String> selectedInterestIds, int limit);

    record Candidate(String programKey, String actionId, String identityBasis,
            String programTitle, String programSummary, String programStatusRaw,
            int conditionCount, List<String> matchedInterestIds, int relatedPlaceCount) {}
}
