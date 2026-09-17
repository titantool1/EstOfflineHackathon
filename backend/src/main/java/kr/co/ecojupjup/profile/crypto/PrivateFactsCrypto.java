package kr.co.ecojupjup.profile.crypto;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Authenticated encryption for one versioned private-facts row payload. */
public final class PrivateFactsCrypto {
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String AAD_PURPOSE = "ecojupjup/private-facts";
    private static final int PAYLOAD_VERSION = 1;
    private static final int AES_256_BYTES = 32;
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int TAG_BYTES = TAG_BITS / Byte.SIZE;
    private static final int MAX_IDENTIFIER_BYTES = 1024;

    private final String activeKeyId;
    private final Map<String, SecretKey> keys;
    private final SecureRandom random;

    /** Creates a crypto boundary from an injected keyring. Key byte arrays are defensively copied. */
    public PrivateFactsCrypto(String activeKeyId, Map<String, byte[]> keys) {
        this(activeKeyId, keys, new SecureRandom());
    }

    PrivateFactsCrypto(String activeKeyId, Map<String, byte[]> keys, SecureRandom random) {
        validateIdentifier(activeKeyId);
        if (keys == null || random == null) {
            throw invalidInput();
        }
        this.random = random;

        Map<String, SecretKey> checkedKeys = new HashMap<>();
        for (Map.Entry<String, byte[]> entry : keys.entrySet()) {
            validateIdentifier(entry.getKey());
            byte[] key = entry.getValue();
            if (key == null || key.length != AES_256_BYTES) {
                throw invalidInput();
            }
            checkedKeys.put(entry.getKey(), new SecretKeySpec(key.clone(), "AES"));
        }
        if (!checkedKeys.containsKey(activeKeyId)) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.UNKNOWN_KEY);
        }
        this.activeKeyId = activeKeyId;
        this.keys = Map.copyOf(checkedKeys);
    }

    public Envelope encrypt(String domain, UUID owner, String rowId, long revision, byte[] payload) {
        validateContext(domain, owner, rowId);
        if (revision < 0 || payload == null) {
            throw invalidInput();
        }

        byte[] nonce = new byte[NONCE_BYTES];
        random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, keys.get(activeKeyId), new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(aad(activeKeyId, domain, owner, rowId, revision));
            return new Envelope(PAYLOAD_VERSION, activeKeyId, nonce, cipher.doFinal(payload), revision);
        } catch (GeneralSecurityException error) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.CRYPTO_OPERATION_FAILED);
        }
    }

    public byte[] decrypt(String domain, UUID owner, String rowId, Envelope envelope) {
        if (envelope == null) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.INVALID_ENVELOPE);
        }
        validateEnvelope(envelope);
        validateContext(domain, owner, rowId);

        SecretKey key = keys.get(envelope.keyId());
        if (key == null) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.UNKNOWN_KEY);
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, envelope.nonce()));
            cipher.updateAAD(aad(envelope.keyId(), domain, owner, rowId, envelope.revision()));
            return cipher.doFinal(envelope.ciphertext());
        } catch (AEADBadTagException error) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.AUTHENTICATION_FAILED);
        } catch (GeneralSecurityException error) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.CRYPTO_OPERATION_FAILED);
        }
    }

    private static void validateEnvelope(Envelope envelope) {
        if (envelope.payloadVersion() != PAYLOAD_VERSION) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.UNSUPPORTED_VERSION);
        }
        try {
            validateIdentifier(envelope.keyId());
        } catch (PrivateFactsCryptoException error) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.INVALID_ENVELOPE);
        }
        byte[] nonce = envelope.nonce();
        byte[] ciphertext = envelope.ciphertext();
        if (nonce == null || nonce.length != NONCE_BYTES || ciphertext == null || ciphertext.length < TAG_BYTES
                || envelope.revision() < 0) {
            throw new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.INVALID_ENVELOPE);
        }
    }

    private static void validateContext(String domain, UUID owner, String rowId) {
        validateIdentifier(domain);
        if (owner == null) {
            throw invalidInput();
        }
        validateIdentifier(rowId);
    }

    private static void validateIdentifier(String value) {
        if (value == null || value.isBlank()) {
            throw invalidInput();
        }
        int encodedLength = value.getBytes(StandardCharsets.UTF_8).length;
        if (encodedLength > MAX_IDENTIFIER_BYTES) {
            throw invalidInput();
        }
    }

    private static byte[] aad(String keyId, String domain, UUID owner, String rowId, long revision) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream output = new DataOutputStream(bytes);
            writePart(output, AAD_PURPOSE);
            writePart(output, Integer.toString(PAYLOAD_VERSION));
            writePart(output, keyId);
            writePart(output, domain);
            writePart(output, owner.toString());
            writePart(output, rowId);
            writePart(output, Long.toString(revision));
            return bytes.toByteArray();
        } catch (IOException impossible) {
            throw new AssertionError(impossible);
        }
    }

    private static void writePart(DataOutputStream output, String value) throws IOException {
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        output.writeInt(encoded.length);
        output.write(encoded);
    }

    private static PrivateFactsCryptoException invalidInput() {
        return new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.INVALID_INPUT);
    }

    public record Envelope(int payloadVersion, String keyId, byte[] nonce, byte[] ciphertext, long revision) {
        public Envelope {
            nonce = nonce == null ? null : nonce.clone();
            ciphertext = ciphertext == null ? null : ciphertext.clone();
        }

        @Override
        public byte[] nonce() {
            return nonce == null ? null : nonce.clone();
        }

        @Override
        public byte[] ciphertext() {
            return ciphertext == null ? null : ciphertext.clone();
        }

        @Override
        public String toString() {
            return "Envelope[payloadVersion=" + payloadVersion
                    + ", nonceBytes=" + (nonce == null ? 0 : nonce.length)
                    + ", ciphertextBytes=" + (ciphertext == null ? 0 : ciphertext.length)
                    + ", revision=" + revision + "]";
        }
    }
}
