package kr.co.ecojupjup.catalog;

import java.time.OffsetDateTime;
import java.util.*;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import kr.co.ecojupjup.profile.migration.V9__Encrypt_existing_private_facts;
import kr.co.ecojupjup.recommendation.adapter.JdbcRecommendationStore;
import kr.co.ecojupjup.recommendation.application.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="PLACE_MAPPING_TEST_DATABASE_URL", matches=".+/eco_places_test")
class PlaceCatalogDatabaseTest {
    @Test void importsCandidatesPreservesOriginalsAndRefreshesAnExistingMissionBatch() {
        var ds = new DriverManagerDataSource(System.getenv("PLACE_MAPPING_TEST_DATABASE_URL"), "eco_test", "");
        var properties = new Properties(); properties.setProperty("currentSchema", "app,public");
        ds.setConnectionProperties(properties);
        var crypto = new PrivateFactsCrypto("test", Map.of("test", new byte[32]));
        var json = new ObjectMapper();
        var config = Flyway.configure().dataSource(ds).schemas("app").defaultSchema("app")
                .cleanDisabled(false).placeholderReplacement(false)
                .javaMigrations(new V9__Encrypt_existing_private_facts(crypto, json, true));
        var before = config.target("12").load(); before.clean(); before.migrate();
        var jdbc = new JdbcTemplate(ds);
        var originals = jdbc.queryForList("SELECT place_id,title,address,district_name FROM app.place ORDER BY place_id");
        assertThat(originals).hasSize(9);
        var owner = UUID.randomUUID(); var batchId = UUID.randomUUID();
        jdbc.update("INSERT INTO app.users(id) VALUES (?)", owner);
        var store = new JdbcRecommendationStore(jdbc);
        store.save(owner, UUID.randomUUID(), 1, RecommendationMode.GENERAL,
                new RecommendationBatch(batchId, "test", "catalog_exploration", OffsetDateTime.now(),
                    List.of(new RecommendationBatch.Item(UUID.randomUUID(), 0, "scheme:KR-CNP-GREEN-2026",
                        "KR-CNP-GREEN-2026-A04", "catalog", "리필", "summary", "unknown", 0,
                        List.of(), "not_evaluated", "unknown", 0))));
        config.target("latest").load().migrate();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.place", Integer.class)).isEqualTo(1382);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.action_place", Integer.class)).isEqualTo(1382);
        assertThat(jdbc.queryForList("SELECT place_id,title,address,district_name FROM app.place WHERE metadata='{}'::jsonb ORDER BY place_id"))
                .isEqualTo(originals);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.users WHERE id=?", Integer.class, owner)).isEqualTo(1);
        assertThat(store.find(owner, batchId).orElseThrow().items().getFirst().relatedPlaceCount()).isEqualTo(320);
        assertThat(jdbc.queryForObject("SELECT related_place_count FROM app.recommendation_item WHERE batch_id=?", Integer.class, batchId))
                .isZero(); // Snapshot is preserved; current association count is projected on read.
        for (var entry : Map.of("A02", 241, "A04", 320, "A08", 812, "A03", 0, "A17", 0).entrySet()) {
            var detail = json.readTree(jdbc.queryForObject("SELECT app.benefit_lookup(?,?)::text", String.class,
                    "scheme:KR-CNP-GREEN-2026", "KR-CNP-GREEN-2026-" + entry.getKey()));
            assertThat(detail.get("places").size()).isEqualTo(entry.getValue());
            for (var place : detail.get("places")) {
                assertThat(place.get("relation_type").asText()).isEqualTo("candidate_action");
                assertThat(place.get("mapping_basis").asText()).contains("미확인");
                assertThat(place.get("source").get("url").asText()).isEmpty();
                assertThat(place.get("source").get("origin").asText()).isEqualTo("legacy_place_catalog");
                assertThat(place.get("status").asText()).isEqualTo("unknown");
            }
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.place WHERE metadata->>'benefit_link_status'='unverified'", Integer.class))
                .isEqualTo(1373);
        config.target("latest").load().validate();
    }
}
