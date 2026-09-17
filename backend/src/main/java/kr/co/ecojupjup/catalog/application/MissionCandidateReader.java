package kr.co.ecojupjup.catalog.application;

import java.util.List;

public interface MissionCandidateReader {
    List<Candidate> find(List<String> selectedInterestIds, int limit);

    record Candidate(String programKey, String actionId, String identityBasis,
            String programTitle, String programSummary, String programStatusRaw,
            int conditionCount, List<String> matchedInterestIds, int relatedPlaceCount) {}
}
