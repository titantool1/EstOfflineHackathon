package kr.co.ecojupjup.profile.facts;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PrivateFactsStore {
    List<StoredFact> list(UUID owner, FactTable table);
    List<StoredFact> listMembers(UUID owner, UUID householdId);
    List<StoredFact> listWelfare(UUID owner, String subjectScope, UUID householdId);
    default List<StoredFact> listWelfare(UUID owner, String subjectScope, UUID householdId, UUID memberId) {
        return listWelfare(owner, subjectScope, householdId).stream()
                .filter(fact -> java.util.Objects.equals(fact.key().memberId(), memberId)).toList();
    }
    Optional<StoredFact> find(UUID owner, FactKey key);
    List<StoredFact> applyChanges(UUID owner, List<FactChange> changes);
}
