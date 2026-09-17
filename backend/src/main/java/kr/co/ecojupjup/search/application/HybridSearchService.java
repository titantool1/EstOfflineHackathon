package kr.co.ecojupjup.search.application;

import java.util.List;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

@Service
public class HybridSearchService {
    private final HybridCatalogSearch search;

    public HybridSearchService(HybridCatalogSearch search) {
        this.search = search;
    }

    public JsonNode search(String query, List<Double> embedding, int limit, int offset) {
        return search.search(HybridSearchQuery.parse(query, embedding, limit, offset));
    }
}
