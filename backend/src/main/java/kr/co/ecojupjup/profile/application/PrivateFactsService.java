package kr.co.ecojupjup.profile.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.profile.facts.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Application entry point; the shared facts port stays stable for condition-save callers. */
@Service
@Primary
public class PrivateFactsService implements PrivateFactsStore {
    private final PrivateFactsStore persistence;

    public PrivateFactsService(@Qualifier("privateFactsPersistence") PrivateFactsStore persistence) {
        this.persistence = persistence;
    }

    @Override
    public List<StoredFact> list(UUID owner, FactTable table) {
        return persistence.list(owner, table);
    }

    @Override
    public List<StoredFact> listMembers(UUID owner, UUID householdId) {
        return persistence.listMembers(owner, householdId);
    }

    @Override
    public List<StoredFact> listWelfare(UUID owner, String subjectScope, UUID householdId) {
        return persistence.listWelfare(owner, subjectScope, householdId);
    }
    @Override public List<StoredFact> listWelfare(UUID owner,String subjectScope,UUID householdId,UUID memberId) {
        return persistence.listWelfare(owner,subjectScope,householdId,memberId);
    }

    @Override
    public Optional<StoredFact> find(UUID owner, FactKey key) {
        return persistence.find(owner, key);
    }

    @Override
    @Transactional
    public List<StoredFact> applyChanges(UUID owner, List<FactChange> changes) {
        return persistence.applyChanges(owner, changes);
    }
}
