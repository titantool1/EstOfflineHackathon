package kr.co.ecojupjup.profile.application;

import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
public class ConditionContextService {
    public record Selection(String programKey, String actionId, UUID householdId, UUID homeId, UUID vehicleId) {
        public Selection {
            if (!validKey(programKey) || !validKey(actionId)) throw new IllegalArgumentException("INVALID_CONTEXT_SELECTION");
        }
        private static boolean validKey(String value) {
            return value != null && value.matches("[A-Za-z0-9:_-]{1,160}");
        }
    }
    public interface Lookup {
        ConditionContext load(UUID authenticatedUserId, Selection selection);
        ConditionContext loadConversation(UUID authenticatedUserId);
    }
    public static class NotFound extends RuntimeException {
        public NotFound() { super("CONDITION_CONTEXT_NOT_FOUND"); }
    }
    private final Lookup lookup;
    public ConditionContextService(Lookup lookup) { this.lookup = lookup; }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ConditionContext loadConversation(UUID authenticatedUserId) {
        return lookup.loadConversation(Objects.requireNonNull(authenticatedUserId));
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ConditionContext load(UUID authenticatedUserId, Selection selection) {
        return lookup.load(Objects.requireNonNull(authenticatedUserId), Objects.requireNonNull(selection));
    }
}
