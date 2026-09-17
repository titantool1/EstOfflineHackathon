package kr.co.ecojupjup.catalog.application;

import java.util.Arrays;
import java.util.List;

public record CatalogQuery(String query, List<String> terms, int limit, int offset) {
    public static CatalogQuery parse(String query, int limit, int offset) {
        if (query == null || query.isBlank() || query.length() > 200 || limit < 1 || limit > 20
                || offset < 0 || offset > 1000) throw new CatalogRequestException(false);
        String normalized = query.strip();
        List<String> terms = Arrays.stream(normalized.split("\\s+", -1)).distinct().toList();
        if (terms.size() > 8) throw new CatalogRequestException(false);
        return new CatalogQuery(normalized, terms, limit, offset);
    }
    public static String identifier(String value) {
        if (value == null || value.isBlank() || value.length() > 160 || !value.equals(value.strip())
                || value.chars().anyMatch(Character::isISOControl)) throw new CatalogRequestException(false);
        return value;
    }
}
