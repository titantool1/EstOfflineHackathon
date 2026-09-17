package kr.co.ecojupjup.profile.crypto;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PrivateFactsKeyringTest {
    @TempDir
    Path temporaryDirectory;
    private int fileNumber;

    @Test
    void loadsTheExactKeyringShape() throws IOException {
        byte[] key = new byte[32];
        String encoded = Base64.getEncoder().encodeToString(key);
        Path file = write("{\"activeKeyId\":\"current\",\"keys\":{\"current\":\"" + encoded + "\"}}");

        PrivateFactsKeyring.Loaded loaded = PrivateFactsKeyring.load(file.toString());

        assertEquals("current", loaded.activeKeyId());
        assertArrayEquals(key, loaded.keys().get("current"));
    }

    @Test
    void rejectsMissingUnknownAndMalformedKeyMaterial() throws IOException {
        assertInvalid(null);
        assertInvalid(write("{").toString());
        assertInvalid(write("{}").toString());
        assertInvalid(write("{\"activeKeyId\":\"missing\",\"keys\":{\"current\":\""
                + Base64.getEncoder().encodeToString(new byte[32]) + "\"}}").toString());
        assertInvalid(write("{\"activeKeyId\":\"current\",\"keys\":{\"current\":\"not base64!\"}}").toString());
        assertInvalid(write("{\"activeKeyId\":\"current\",\"keys\":{\"current\":\""
                + Base64.getEncoder().encodeToString(new byte[31]) + "\"}}").toString());
        assertInvalid(write("{\"activeKeyId\":\"current\",\"keys\":{},\"extra\":true}").toString());
    }

    @Test
    void rejectsDuplicateJsonPropertiesIdsAndKeyMaterial() throws IOException {
        String first = Base64.getEncoder().encodeToString(new byte[32]);
        byte[] otherKey = new byte[32];
        otherKey[0] = 1;
        String second = Base64.getEncoder().encodeToString(otherKey);

        assertInvalid(write("{\"activeKeyId\":\"one\",\"activeKeyId\":\"two\",\"keys\":{\"one\":\""
                + first + "\"}}").toString());
        assertInvalid(write("{\"activeKeyId\":\"one\",\"keys\":{\"one\":\"" + first
                + "\",\"one\":\"" + second + "\"}}").toString());
        assertInvalid(write("{\"activeKeyId\":\"one\",\"keys\":{\"one\":\"" + first
                + "\",\"two\":\"" + first + "\"}}").toString());
    }

    private Path write(String json) throws IOException {
        Path file = temporaryDirectory.resolve("keyring-" + fileNumber++ + ".json");
        return Files.writeString(file, json);
    }

    private static void assertInvalid(String path) {
        PrivateFactsCryptoException error = assertThrows(
                PrivateFactsCryptoException.class, () -> PrivateFactsKeyring.load(path));
        assertEquals(PrivateFactsCryptoException.Code.INVALID_KEYRING, error.code());
        assertEquals("INVALID_KEYRING", error.getMessage());
    }
}
