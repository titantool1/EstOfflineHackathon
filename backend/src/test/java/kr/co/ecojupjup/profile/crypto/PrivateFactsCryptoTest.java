package kr.co.ecojupjup.profile.crypto;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PrivateFactsCryptoTest {
    private static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final UUID OTHER_OWNER = UUID.fromString("00000000-0000-4000-8000-000000000002");
    private static final byte[] PAYLOAD = "synthetic-private-fact".getBytes(StandardCharsets.UTF_8);

    @Test
    void roundTripsAndUsesAUniqueNonce() {
        PrivateFactsCrypto crypto = crypto("key-1", key(1));

        PrivateFactsCrypto.Envelope first = crypto.encrypt("profile", OWNER, "profile-row", 4, PAYLOAD);
        PrivateFactsCrypto.Envelope second = crypto.encrypt("profile", OWNER, "profile-row", 4, PAYLOAD);

        assertArrayEquals(PAYLOAD, crypto.decrypt("profile", OWNER, "profile-row", first));
        assertFalse(Arrays.equals(first.nonce(), second.nonce()));
        assertEquals(12, first.nonce().length);
        assertEquals(PAYLOAD.length + 16, first.ciphertext().length);
    }

    @Test
    void rejectsCiphertextTamperingAndWrongAadContext() {
        PrivateFactsCrypto crypto = crypto("key-1", key(1));
        PrivateFactsCrypto.Envelope envelope = crypto.encrypt("profile", OWNER, "profile-row", 4, PAYLOAD);
        byte[] tampered = envelope.ciphertext();
        tampered[0] ^= 1;
        byte[] tamperedNonce = envelope.nonce();
        tamperedNonce[0] ^= 1;

        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("profile", OWNER, "profile-row", copy(envelope, tampered, 4)));
        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("profile", OWNER, "profile-row",
                        new PrivateFactsCrypto.Envelope(1, envelope.keyId(), tamperedNonce,
                                envelope.ciphertext(), envelope.revision())));
        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("household", OWNER, "profile-row", envelope));
        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("profile", OTHER_OWNER, "profile-row", envelope));
        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("profile", OWNER, "other-row", envelope));
        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("profile", OWNER, "profile-row", copy(envelope, envelope.ciphertext(), 5)));
    }

    @Test
    void rejectsUnknownKeyAndUnsupportedVersionBeforeDecryption() {
        PrivateFactsCrypto crypto = new PrivateFactsCrypto(
                "key-1", Map.of("key-1", key(1), "key-2", key(2)));
        PrivateFactsCrypto.Envelope envelope = crypto.encrypt("profile", OWNER, "profile-row", 0, PAYLOAD);

        assertCode(PrivateFactsCryptoException.Code.UNKNOWN_KEY,
                () -> crypto.decrypt("profile", OWNER, "profile-row",
                        new PrivateFactsCrypto.Envelope(1, "missing", envelope.nonce(), envelope.ciphertext(), 0)));
        assertCode(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED,
                () -> crypto.decrypt("profile", OWNER, "profile-row",
                        new PrivateFactsCrypto.Envelope(1, "key-2", envelope.nonce(), envelope.ciphertext(), 0)));
        assertCode(PrivateFactsCryptoException.Code.UNSUPPORTED_VERSION,
                () -> crypto.decrypt("profile", OWNER, "profile-row",
                        new PrivateFactsCrypto.Envelope(2, envelope.keyId(), envelope.nonce(), envelope.ciphertext(), 0)));
    }

    @Test
    void readsRetiringKeysAfterActiveKeyRotation() {
        PrivateFactsCrypto oldWriter = crypto("old", key(1));
        PrivateFactsCrypto.Envelope oldEnvelope = oldWriter.encrypt("profile", OWNER, "row", 1, PAYLOAD);
        PrivateFactsCrypto rotated = new PrivateFactsCrypto("new", Map.of("old", key(1), "new", key(2)));
        PrivateFactsCrypto.Envelope newEnvelope = rotated.encrypt("profile", OWNER, "row", 2, PAYLOAD);

        assertArrayEquals(PAYLOAD, rotated.decrypt("profile", OWNER, "row", oldEnvelope));
        assertArrayEquals(PAYLOAD, rotated.decrypt("profile", OWNER, "row", newEnvelope));
        assertEquals("new", newEnvelope.keyId());
    }

    @Test
    void envelopeArraysAreMutationSafeAndToStringOmitsTheirValuesAndKeyId() {
        byte[] nonce = new byte[12];
        byte[] ciphertext = new byte[16];
        PrivateFactsCrypto.Envelope envelope = new PrivateFactsCrypto.Envelope(1, "secret-key-id", nonce, ciphertext, 0);
        nonce[0] = 1;
        ciphertext[0] = 1;
        byte[] returnedNonce = envelope.nonce();
        byte[] returnedCiphertext = envelope.ciphertext();
        returnedNonce[1] = 1;
        returnedCiphertext[1] = 1;

        assertArrayEquals(new byte[12], envelope.nonce());
        assertArrayEquals(new byte[16], envelope.ciphertext());
        assertFalse(envelope.toString().contains("secret-key-id"));
        assertFalse(envelope.toString().contains("[0,"));
    }

    @Test
    void rejectsMalformedEnvelopeLengthsAndRevision() {
        PrivateFactsCrypto crypto = crypto("key-1", key(1));

        assertCode(PrivateFactsCryptoException.Code.INVALID_ENVELOPE,
                () -> crypto.decrypt("profile", OWNER, "row",
                        new PrivateFactsCrypto.Envelope(1, "key-1", new byte[11], new byte[16], 0)));
        assertCode(PrivateFactsCryptoException.Code.INVALID_ENVELOPE,
                () -> crypto.decrypt("profile", OWNER, "row",
                        new PrivateFactsCrypto.Envelope(1, "key-1", new byte[12], new byte[15], 0)));
        assertCode(PrivateFactsCryptoException.Code.INVALID_ENVELOPE,
                () -> crypto.decrypt("profile", OWNER, "row",
                        new PrivateFactsCrypto.Envelope(1, "key-1", new byte[12], new byte[16], -1)));
    }

    private static PrivateFactsCrypto.Envelope copy(
            PrivateFactsCrypto.Envelope source, byte[] ciphertext, long revision) {
        return new PrivateFactsCrypto.Envelope(
                source.payloadVersion(), source.keyId(), source.nonce(), ciphertext, revision);
    }

    private static PrivateFactsCrypto crypto(String keyId, byte[] key) {
        return new PrivateFactsCrypto(keyId, Map.of(keyId, key));
    }

    private static byte[] key(int seed) {
        byte[] key = new byte[32];
        Arrays.fill(key, (byte) seed);
        return key;
    }

    private static void assertCode(PrivateFactsCryptoException.Code code, Runnable operation) {
        PrivateFactsCryptoException error = assertThrows(PrivateFactsCryptoException.class, operation::run);
        assertEquals(code, error.code());
        assertEquals(code.name(), error.getMessage());
    }
}
