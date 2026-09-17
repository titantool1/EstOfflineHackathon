package kr.co.ecojupjup.search.adapter;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import kr.co.ecojupjup.search.api.HybridSearchException;
import kr.co.ecojupjup.search.application.HybridSearchQuery;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class ElasticsearchHybridCatalogSearchTest {
    private final JsonMapper json = new JsonMapper();

    @Test void combinesKeywordAndVectorRanksAndKeepsCanonicalPair() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        List<String> bodies = new ArrayList<>();
        HttpServer server = server(exchange -> {
            bodies.add(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String[] ids = calls.getAndIncrement() == 0 ? new String[]{"B", "A"} : new String[]{"A", "C"};
            respond(exchange, 200, hits(ids));
        });
        try {
            var search = new ElasticsearchHybridCatalogSearch(json, HttpClient.newHttpClient(),
                    URI.create("http://127.0.0.1:" + server.getAddress().getPort()), "catalog-test", "elastic", "secret");
            JsonNode result = search.search(HybridSearchQuery.parse("텀블러 혜택", vector(), 3, 0));
            assertEquals("hybrid_rrf", result.path("match_mode").asText());
            assertEquals(List.of("A", "B", "C"), result.path("items").valueStream()
                    .map(item -> item.path("action_id").asText()).toList());
            assertTrue(result.path("items").valueStream()
                    .allMatch(item -> item.path("program_key").asText().equals("scheme:P")));
            assertTrue(bodies.get(0).contains("title.ko^4"));
            assertTrue(bodies.get(1).contains("query_vector"));
        } finally { server.stop(0); }
    }

    @Test void rejectsBadVectorsBeforeUpstreamAndNeverTurnsUpstreamFailureIntoEmpty() throws Exception {
        List<Double> invalid = new ArrayList<>(vector());
        invalid.set(1, 1.0);
        HybridSearchException vectorError = assertThrows(HybridSearchException.class,
                () -> HybridSearchQuery.parse("질문", invalid, 10, 0));
        assertEquals("CATALOG_SEARCH_REQUEST_INVALID", vectorError.code);

        HttpServer server = server(exchange -> respond(exchange, 503, "{}"));
        try {
            var search = new ElasticsearchHybridCatalogSearch(json, HttpClient.newHttpClient(),
                    URI.create("http://127.0.0.1:" + server.getAddress().getPort()), "catalog-test", "elastic", "secret");
            HybridSearchException upstream = assertThrows(HybridSearchException.class,
                    () -> search.search(HybridSearchQuery.parse("질문", vector(), 10, 0)));
            assertEquals("CATALOG_SEARCH_UPSTREAM_FAILED", upstream.code);
        } finally { server.stop(0); }
    }

    @Test void pagesShareOneRankingPool() throws Exception {
        List<String> bodies = new ArrayList<>();
        HttpServer server = server(exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            bodies.add(body);
            respond(exchange, 200, hits(body.contains("query_vector")
                    ? new String[]{"C", "B", "A"} : new String[]{"A", "B", "C"}));
        });
        try {
            var search = new ElasticsearchHybridCatalogSearch(json, HttpClient.newHttpClient(),
                    URI.create("http://127.0.0.1:" + server.getAddress().getPort()), "catalog-test", "elastic", "secret");
            JsonNode first = search.search(HybridSearchQuery.parse("질문", vector(), 1, 0));
            JsonNode second = search.search(HybridSearchQuery.parse("질문", vector(), 1, 1));
            assertNotEquals(first.path("items").get(0).path("action_id").asText(),
                    second.path("items").get(0).path("action_id").asText());
            assertEquals(bodies.get(0), bodies.get(2));
            assertEquals(bodies.get(1), bodies.get(3));
            assertTrue(first.path("has_more").asBoolean());
        } finally { server.stop(0); }
    }

    private List<Double> vector() {
        List<Double> vector = new ArrayList<>(java.util.Collections.nCopies(1024, 0.0));
        vector.set(0, 1.0);
        return vector;
    }

    private String hits(String[] actionIds) {
        var hits = json.createArrayNode();
        for (String actionId : actionIds) {
            var source = json.createObjectNode();
            source.put("program_key", "scheme:P"); source.put("action_id", actionId);
            source.put("title", "행동 " + actionId); source.put("identity_basis", "explicit");
            source.putNull("program_status"); source.putNull("catalog_district"); source.putArray("condition_labels");
            hits.add(json.createObjectNode().set("_source", source));
        }
        var response = json.createObjectNode();
        response.put("timed_out", false);
        response.set("_shards", json.valueToTree(java.util.Map.of("failed", 0)));
        response.set("hits", json.createObjectNode().set("hits", hits));
        return response.toString();
    }

    private HttpServer server(Handler handler) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/catalog-test/_search", exchange -> {
            try { handler.handle(exchange); }
            catch (Exception error) { exchange.close(); }
        });
        server.start();
        return server;
    }

    private void respond(HttpExchange exchange, int status, String body) throws Exception {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @FunctionalInterface
    private interface Handler { void handle(HttpExchange exchange) throws Exception; }
}
