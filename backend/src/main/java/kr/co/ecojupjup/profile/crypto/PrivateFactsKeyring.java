package kr.co.ecojupjup.profile.crypto;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class PrivateFactsKeyring {
    private static final Set<String> ROOT_PROPERTIES = Set.of("activeKeyId", "keys");
    private static final int AES_256_BYTES = 32;
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .build();

    private PrivateFactsKeyring() {}

    static Loaded load(String configuredPath) {
        if (configuredPath == null || configuredPath.isBlank()) {
            throw invalid();
        }

        final Path path;
        try {
            path = Path.of(configuredPath);
        } catch (RuntimeException error) {
            throw invalid();
        }
        if (!Files.isRegularFile(path)) {
            throw invalid();
        }

        final JsonNode root;
        try {
            root = JSON.readTree(path);
        } catch (JacksonException error) {
            throw invalid();
        }
        if (root == null || !root.isObject()
                || root.size() != ROOT_PROPERTIES.size()
                || !new HashSet<>(root.propertyNames()).equals(ROOT_PROPERTIES)) {
            throw invalid();
        }

        JsonNode activeNode = root.get("activeKeyId");
        JsonNode keysNode = root.get("keys");
        if (activeNode == null || !activeNode.isString() || keysNode == null || !keysNode.isObject()) {
            throw invalid();
        }

        String activeKeyId = activeNode.asString();
        validateKeyId(activeKeyId);
        if (keysNode.isEmpty()) {
            throw invalid();
        }

        Map<String, byte[]> keys = new HashMap<>();
        Set<ByteArrayValue> distinctKeys = new HashSet<>();
        for (Map.Entry<String, JsonNode> property : keysNode.properties()) {
            String keyId = property.getKey();
            validateKeyId(keyId);
            if (!property.getValue().isString()) {
                throw invalid();
            }

            byte[] key;
            try {
                key = Base64.getDecoder().decode(property.getValue().asString());
            } catch (IllegalArgumentException error) {
                throw invalid();
            }
            if (key.length != AES_256_BYTES || keys.put(keyId, key) != null
                    || !distinctKeys.add(new ByteArrayValue(key))) {
                throw invalid();
            }
        }
        if (!keys.containsKey(activeKeyId)) {
            throw invalid();
        }
        return new Loaded(activeKeyId, keys);
    }

    private static void validateKeyId(String keyId) {
        if (keyId == null || keyId.isBlank() || keyId.length() > 128) {
            throw invalid();
        }
    }

    private static PrivateFactsCryptoException invalid() {
        return new PrivateFactsCryptoException(PrivateFactsCryptoException.Code.INVALID_KEYRING);
    }

    record Loaded(String activeKeyId, Map<String, byte[]> keys) {
        Loaded {
            Map<String, byte[]> copy = new HashMap<>();
            keys.forEach((keyId, key) -> copy.put(keyId, key.clone()));
            keys = Map.copyOf(copy);
        }

        @Override
        public Map<String, byte[]> keys() {
            Map<String, byte[]> copy = new HashMap<>();
            keys.forEach((keyId, key) -> copy.put(keyId, key.clone()));
            return Map.copyOf(copy);
        }
    }

    private static final class ByteArrayValue {
        private final byte[] value;

        private ByteArrayValue(byte[] value) {
            this.value = value;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof ByteArrayValue that && Arrays.equals(value, that.value);
        }

        @Override
        public int hashCode() {
            return Arrays.hashCode(value);
        }
    }
}
