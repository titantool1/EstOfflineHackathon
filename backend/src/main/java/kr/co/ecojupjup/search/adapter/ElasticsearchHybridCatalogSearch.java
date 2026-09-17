package kr.co.ecojupjup.search.adapter;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.co.ecojupjup.search.api.HybridSearchException;
import kr.co.ecojupjup.search.application.HybridCatalogSearch;
import kr.co.ecojupjup.search.application.HybridSearchQuery;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
public class ElasticsearchHybridCatalogSearch implements HybridCatalogSearch {
    static final int RRF_K = 60;
    // Keep the same ranking pool across pages; changing it can duplicate or skip candidates.
    static final int CANDIDATE_WINDOW = 1021;
    private static final List<String> SOURCE_FIELDS = List.of(
            "program_key", "action_id", "title", "identity_basis", "program_status",
            "catalog_district", "condition_labels");

    private final ObjectMapper json;
    private final HttpClient http;
    private final URI endpoint;
    private final String index;
    private final String authorization;

    @Autowired
    public ElasticsearchHybridCatalogSearch(ObjectMapper json,
            @Value("${catalog.elasticsearch.url:http://localhost:19201}") String url,
            @Value("${catalog.elasticsearch.index:eco-team-catalog-actions-v1-20260917}") String index,
            @Value("${catalog.elasticsearch.username:elastic}") String username,
            @Value("${catalog.elasticsearch.password:}") String password) {
        this(json, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build(),
                URI.create(url), index, username, password);
    }

    ElasticsearchHybridCatalogSearch(ObjectMapper json, HttpClient http, URI endpoint,
            String index, String username, String password) {
        if (!List.of("http", "https").contains(endpoint.getScheme()) || endpoint.getHost() == null
                || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null
                || !index.matches("[a-z0-9._-]{1,255}")) {
            throw new IllegalArgumentException("invalid Elasticsearch configuration");
        }
        this.json = json;
        this.http = http;
        this.endpoint = endpoint;
        this.index = index;
        this.authorization = "Basic " + Base64.getEncoder().encodeToString(
                (username + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public JsonNode search(HybridSearchQuery query) {
        int channelSize = CANDIDATE_WINDOW;
        List<Hit> keyword = execute(keywordBody(query.query(), channelSize));
        List<Hit> semantic = execute(vectorBody(query.embedding(), channelSize));
        List<Hit> ranked = rrf(List.of(keyword, semantic));
        int end = Math.min(ranked.size(), query.offset() + query.limit());
        List<Hit> page = query.offset() >= ranked.size() ? List.of() : ranked.subList(query.offset(), end);

        ObjectNode result = json.createObjectNode();
        result.put("query", query.query());
        result.put("match_mode", "hybrid_rrf");
        result.put("offset", query.offset());
        result.put("limit", query.limit());
        result.put("has_more", ranked.size() > end);
        ArrayNode items = result.putArray("items");
        page.forEach(hit -> items.add(hit.source().deepCopy()));
        return result;
    }

    private ObjectNode keywordBody(String query, int size) {
        ObjectNode body = json.createObjectNode();
        body.put("size", size);
        body.set("_source", json.valueToTree(SOURCE_FIELDS));
        ObjectNode match = json.createObjectNode();
        match.put("query", query);
        match.put("type", "best_fields");
        match.set("fields", json.valueToTree(List.of("title.ko^4", "title^2", "search_text.ko^2", "search_text")));
        body.set("query", json.createObjectNode().set("multi_match", match));
        return body;
    }

    private ObjectNode vectorBody(List<Double> embedding, int size) {
        ObjectNode knn = json.createObjectNode();
        knn.put("field", "embedding");
        knn.set("query_vector", json.valueToTree(embedding));
        knn.put("k", size);
        knn.put("num_candidates", Math.min(10_000, Math.max(size * 4, size)));
        ObjectNode body = json.createObjectNode();
        body.put("size", size);
        body.set("_source", json.valueToTree(SOURCE_FIELDS));
        body.set("query", json.createObjectNode().set("knn", knn));
        return body;
    }

    private List<Hit> execute(ObjectNode body) {
        JsonNode response = request(body);
        if (!response.path("timed_out").isBoolean() || !response.path("_shards").path("failed").canConvertToInt())
            throw HybridSearchException.unavailable("CATALOG_SEARCH_RESPONSE_INVALID");
        if (response.path("timed_out").asBoolean() || response.path("_shards").path("failed").asInt() > 0)
            throw HybridSearchException.unavailable("CATALOG_SEARCH_PARTIAL");
        JsonNode hits = response.path("hits").path("hits");
        if (!hits.isArray()) throw HybridSearchException.unavailable("CATALOG_SEARCH_RESPONSE_INVALID");
        List<Hit> result = new ArrayList<>();
        for (JsonNode hit : hits) {
            JsonNode source = hit.path("_source");
            validateCandidate(source);
            result.add(new Hit(source.path("program_key").asText(), source.path("action_id").asText(), source));
        }
        return result;
    }

    private void validateCandidate(JsonNode source) {
        if (!source.isObject() || blank(source, "program_key") || blank(source, "action_id")
                || blank(source, "title") || blank(source, "identity_basis")
                || !source.has("program_status") || !source.has("catalog_district")
                || !source.path("condition_labels").isArray()) {
            throw HybridSearchException.unavailable("CATALOG_SEARCH_RESPONSE_INVALID");
        }
        for (JsonNode label : source.path("condition_labels")) {
            if (!label.isTextual() || label.asText().isBlank())
                throw HybridSearchException.unavailable("CATALOG_SEARCH_RESPONSE_INVALID");
        }
    }

    private boolean blank(JsonNode source, String field) {
        return !source.path(field).isTextual() || source.path(field).asText().isBlank();
    }

    private JsonNode request(ObjectNode body) {
        URI uri = endpoint.resolve("/" + index + "/_search");
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5))
                .header("Authorization", authorization).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw HybridSearchException.unavailable("CATALOG_SEARCH_UPSTREAM_FAILED");
            return json.readTree(response.body());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw HybridSearchException.unavailable("CATALOG_SEARCH_UPSTREAM_FAILED");
        } catch (IOException | JacksonException error) {
            throw HybridSearchException.unavailable("CATALOG_SEARCH_UPSTREAM_FAILED");
        }
    }

    static List<Hit> rrf(List<List<Hit>> channels) {
        Map<String, Score> scores = new LinkedHashMap<>();
        Map<String, Hit> hits = new LinkedHashMap<>();
        for (List<Hit> channel : channels) {
            Set<String> seen = new LinkedHashSet<>();
            for (int rank = 0; rank < channel.size(); rank++) {
                Hit hit = channel.get(rank);
                String key = hit.programKey() + "\u0000" + hit.actionId();
                if (!seen.add(key)) continue;
                hits.putIfAbsent(key, hit);
                Score score = scores.computeIfAbsent(key, ignored -> new Score());
                score.value += 1.0 / (RRF_K + rank + 1);
                score.bestRank = Math.min(score.bestRank, rank + 1);
            }
        }
        return scores.entrySet().stream().sorted(Comparator
                .<Map.Entry<String, Score>>comparingDouble(entry -> entry.getValue().value).reversed()
                .thenComparingInt(entry -> entry.getValue().bestRank)
                .thenComparing(Map.Entry::getKey)).map(entry -> hits.get(entry.getKey())).toList();
    }

    record Hit(String programKey, String actionId, JsonNode source) {}
    private static final class Score { double value; int bestRank = Integer.MAX_VALUE; }
}
