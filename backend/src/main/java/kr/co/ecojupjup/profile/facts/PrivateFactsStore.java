package kr.co.ecojupjup.profile.facts;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PrivateFactsStore {
    List<StoredFact> list(UUID owner, FactTable table);
    List<StoredFact> listMembers(UUID owner, UUID householdId);
    List<StoredFact> listWelfare(UUID owner, String subjectScope, UUID householdId);
    Optional<StoredFact> find(UUID owner, FactKey key);
    List<StoredFact> applyChanges(UUID owner, List<FactChange> changes);
}
