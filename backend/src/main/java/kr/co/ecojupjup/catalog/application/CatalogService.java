package kr.co.ecojupjup.catalog.application;

import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

@Service
public class CatalogService {
    private final CatalogReader reader;
    public CatalogService(CatalogReader reader) { this.reader = reader; }
    public JsonNode search(String query, int limit, int offset) {
        return reader.search(CatalogQuery.parse(query, limit, offset));
    }
    public JsonNode detail(String programKey, String actionId) {
        JsonNode result = reader.detail(CatalogQuery.identifier(programKey), CatalogQuery.identifier(actionId));
        if (result == null || result.isNull()) throw new CatalogRequestException(true);
        return result;
    }
}
