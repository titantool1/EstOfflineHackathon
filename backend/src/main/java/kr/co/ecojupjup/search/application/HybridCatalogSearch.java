package kr.co.ecojupjup.search.application;

import tools.jackson.databind.JsonNode;

public interface HybridCatalogSearch {
    JsonNode search(HybridSearchQuery query);
}
