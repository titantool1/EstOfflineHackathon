package kr.co.ecojupjup.identity.application;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;

/** Server-only member identity attached by the authenticated session filter. */
public final class MemberRequestContext {
    public static final String ATTRIBUTE = "eco.currentUserId";

    private MemberRequestContext() {}

    public static UUID owner(HttpServletRequest request) {
        return request.getAttribute(ATTRIBUTE) instanceof UUID owner ? owner : null;
    }
}
