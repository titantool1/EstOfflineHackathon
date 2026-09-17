package kr.co.ecojupjup.profile.application;

import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;

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
    }
    public static class NotFound extends RuntimeException {
        public NotFound() { super("CONDITION_CONTEXT_NOT_FOUND"); }
    }
    private final Lookup lookup;
    public ConditionContextService(Lookup lookup) { this.lookup = lookup; }
    public ConditionContext load(UUID authenticatedUserId, Selection selection) {
        return lookup.load(Objects.requireNonNull(authenticatedUserId), Objects.requireNonNull(selection));
    }
}
