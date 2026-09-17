package kr.co.ecojupjup.profile.application;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InterestService {
    public interface Store {
        List<InterestProfile.Option> findOptions();
        List<String> findInterestIds(UUID owner);
        void lockOwner(UUID owner);
        void replace(UUID owner, List<String> interestIds);
    }

    private final Store store;
    public InterestService(Store store) { this.store = store; }

    @Transactional(readOnly = true)
    public InterestProfile get(UUID owner) {
        Objects.requireNonNull(owner);
        List<InterestProfile.Option> options = store.findOptions();
        return new InterestProfile(options, ordered(store.findInterestIds(owner), options));
    }

    @Transactional
    public InterestProfile replace(UUID owner, List<String> interestIds) {
        Objects.requireNonNull(owner);
        if (interestIds == null) throw new IllegalArgumentException("INVALID_INTERESTS");
        List<String> requested = new ArrayList<>(interestIds);
        Set<String> unique = new HashSet<>();
        for (String interestId : requested) {
            if (interestId == null || !unique.add(interestId))
                throw new IllegalArgumentException("INVALID_INTERESTS");
        }

        List<InterestProfile.Option> options = store.findOptions();
        Set<String> allowed = new HashSet<>();
        for (InterestProfile.Option option : options) allowed.add(option.id());
        if (!allowed.containsAll(requested) || (unique.contains("unsure") && requested.size() != 1))
            throw new IllegalArgumentException("INVALID_INTERESTS");

        // Serialize whole-set replacement for one member so concurrent requests cannot interleave.
        store.lockOwner(owner);
        store.replace(owner, requested);
        return new InterestProfile(options, ordered(requested, options));
    }

    private static List<String> ordered(List<String> selected, List<InterestProfile.Option> options) {
        Set<String> ids = Set.copyOf(selected);
        return options.stream().map(InterestProfile.Option::id).filter(ids::contains).toList();
    }
}
