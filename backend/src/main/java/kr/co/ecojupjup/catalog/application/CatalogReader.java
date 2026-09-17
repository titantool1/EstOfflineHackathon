package kr.co.ecojupjup.catalog.application;

import tools.jackson.databind.JsonNode;

public interface CatalogReader {
    JsonNode search(CatalogQuery query);
    JsonNode detail(String programKey, String actionId);
}
