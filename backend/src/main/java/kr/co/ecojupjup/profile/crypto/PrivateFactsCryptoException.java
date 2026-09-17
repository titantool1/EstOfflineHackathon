package kr.co.ecojupjup.profile.crypto;

/** A safe, value-free failure raised by the private-facts cryptographic boundary. */
public final class PrivateFactsCryptoException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public enum Code {
        INVALID_INPUT,
        INVALID_ENVELOPE,
        UNSUPPORTED_VERSION,
        UNKNOWN_KEY,
        AUTHENTICATION_FAILED,
        CRYPTO_OPERATION_FAILED,
        INVALID_KEYRING
    }

    private final Code code;

    PrivateFactsCryptoException(Code code) {
        super(code.name());
        this.code = code;
    }

    public Code code() {
        return code;
    }
}
