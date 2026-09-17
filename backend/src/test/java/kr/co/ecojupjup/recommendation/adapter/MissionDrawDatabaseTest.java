package kr.co.ecojupjup.recommendation.adapter;

import java.util.*;
import javax.sql.DataSource;
import kr.co.ecojupjup.catalog.adapter.JdbcMissionCandidateReader;
import kr.co.ecojupjup.profile.application.*;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import kr.co.ecojupjup.profile.migration.V9__Encrypt_existing_private_facts;
import kr.co.ecojupjup.recommendation.application.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="DRAW_TEST_DATABASE_URL", matches=".+/eco_draw_test")
class MissionDrawDatabaseTest {
    static DataSource ds;
    @BeforeAll static void migrate() {
        var source = new DriverManagerDataSource(System.getenv("DRAW_TEST_DATABASE_URL"), "eco_test", "");
        var properties = new Properties(); properties.setProperty("currentSchema", "app,public");
        source.setConnectionProperties(properties); ds=source;
        var crypto=new PrivateFactsCrypto("test",Map.of("test",new byte[32]));
        var flyway=Flyway.configure().dataSource(ds).schemas("app").defaultSchema("app")
            .cleanDisabled(false).placeholderReplacement(false)
            .javaMigrations(new V9__Encrypt_existing_private_facts(crypto,new ObjectMapper(),true)).load();
        flyway.clean();flyway.migrate();
    }
    UUID owner() {
        var owner=UUID.randomUUID();new JdbcTemplate(ds).update("INSERT INTO app.users(id) VALUES (?)",owner);return owner;
    }
    RecommendationService service(UUID owner,List<String> selected) {
        var interests=mock(InterestService.class);
        when(interests.get(owner)).thenReturn(new InterestProfile(List.of(),selected));
        return new RecommendationService(new JdbcRecommendationStore(new JdbcTemplate(ds)),
            new JdbcMissionCandidateReader(new NamedParameterJdbcTemplate(ds)),interests,5);
    }
    static Set<String> keys(RecommendationBatch batch) {
        var keys=new HashSet<String>();
        for(var item:batch.items()) assertThat(keys.add(item.programKey()+"/"+item.actionId())).isTrue();
        return keys;
    }
    @Test void sameBatchHasDistinctActionsAndFreshBatchesExhaustThePoolBeforeRepeating() {
        var owner=owner();var service=service(owner,List.of("waste-reduction"));
        var first=service.create(owner,UUID.randomUUID(),5);var second=service.create(owner,UUID.randomUUID(),5);
        var seen=keys(first);assertThat(keys(second)).doesNotContainAnyElementsOf(seen);seen.addAll(keys(second));
        assertThat(seen).hasSize(10);
        var third=service.create(owner,UUID.randomUUID(),5);keys(third);
        assertThat(third.items()).hasSize(5);
        assertThat(seen).doesNotContain(third.items().getFirst().programKey()+"/"+third.items().getFirst().actionId());
        seen.addAll(keys(third));assertThat(seen).hasSize(11);
        assertThat(third.items()).allMatch(i->i.matchedInterestIds().contains("waste-reduction"));
    }
    @Test void retryReplaysSnapshotAndDoesNotConsumeAnotherDraw() {
        var owner=owner();var service=service(owner,List.of("eco-learning"));var request=UUID.randomUUID();
        var first=service.create(owner,request,5);assertThat(service.create(owner,request,5)).isEqualTo(first);
        assertThat(new JdbcTemplate(ds).queryForObject("SELECT count(*) FROM app.recommendation_batch WHERE user_id=?",Integer.class,owner)).isEqualTo(1);
        assertThatThrownBy(()->service.create(owner,request,4)).isInstanceOf(RecommendationException.class);
    }
    @Test void generalAndInterestPanesShareHistoryButOtherUsersDoNot() {
        var owner=owner();var service=service(owner,List.of("waste-reduction"));
        var interest=service.create(owner,UUID.randomUUID(),5);
        var general=service.create(owner,UUID.randomUUID(),20,"general");
        assertThat(keys(general)).doesNotContainAnyElementsOf(keys(interest));
        var other=owner();var otherService=service(other,List.of("waste-reduction"));
        // This user can still draw every action, including the first user's recommendations.
        assertThat(keys(otherService.create(other,UUID.randomUUID(),20))).hasSize(11).containsAll(keys(interest));
    }
    @Test void smallPoolReturnsOnlyAvailableActionsAndPreservesActionSpecificLinks() {
        var owner=owner();var service=service(owner,List.of("waste-reduction"));
        var batch=service.create(owner,UUID.randomUUID(),20);assertThat(keys(batch)).hasSize(11);
        for(var entry:Map.of("A02",241,"A05",0,"A08",812).entrySet()) {
            var item=batch.items().stream().filter(i->i.actionId().equals("KR-CNP-GREEN-2026-"+entry.getKey())).findFirst().orElseThrow();
            assertThat(item.relatedPlaceCount()).isEqualTo(entry.getValue());
            assertThat(item.conditionCount()).isEqualTo(3);
        }
        assertThat(new JdbcRecommendationStore(new JdbcTemplate(ds)).find(owner,batch.batchId()).orElseThrow()).isEqualTo(batch);
    }
}
