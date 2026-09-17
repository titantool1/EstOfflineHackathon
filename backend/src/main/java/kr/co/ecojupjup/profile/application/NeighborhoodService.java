package kr.co.ecojupjup.profile.application;

import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NeighborhoodService {
    public interface Store {
        Optional<Neighborhood> find(UUID owner);
        void save(UUID owner, Neighborhood neighborhood);
    }

    private final Store store;
    public NeighborhoodService(Store store) { this.store = store; }

    @Transactional(readOnly = true)
    public Optional<Neighborhood> get(UUID owner) {
        return store.find(Objects.requireNonNull(owner));
    }

    @Transactional
    public Neighborhood save(UUID owner, Neighborhood neighborhood) {
        store.save(Objects.requireNonNull(owner), Objects.requireNonNull(neighborhood));
        return neighborhood;
    }
}
