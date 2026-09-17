package kr.co.ecojupjup.profile.facts;

/** Value-free validation and concurrency errors at the facts boundary. */
public final class PrivateFactsException extends RuntimeException {
    public enum Code { INVALID_KEY, INVALID_PAYLOAD, NOT_FOUND, REVISION_CONFLICT, BROKEN_REFERENCE, CONSTRAINT_VIOLATION }
    private final Code code;

    public PrivateFactsException(Code code) {
        super(code.name());
        this.code = code;
    }

    public Code code() { return code; }
}
