package kr.co.ecojupjup.places;

import kr.co.ecojupjup.places.adapter.JdbcPlaceReader;
import kr.co.ecojupjup.places.application.PlaceQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="PLACE_TEST_DATABASE_URL",matches=".+")
class PlaceDatabaseTest {
    private DriverManagerDataSource source() {
        return new DriverManagerDataSource(System.getenv("PLACE_TEST_DATABASE_URL"),"eco","map-test");
    }

    private List<String> ids(JsonNode response) {
        var ids = new ArrayList<String>();
        response.get("results").forEach(place -> ids.add(place.get("docId").asText()));
        return ids;
    }

    @Test void districtSearchIgnoresRadiusAndMatchesOnlyTheRequestedDistrict() {
        var jdbc = new NamedParameterJdbcTemplate(new DriverManagerDataSource(System.getenv("PLACE_TEST_DATABASE_URL"),"eco","map-test"));
        var reader = new JdbcPlaceReader(jdbc,new JsonMapper());
        var mapo = reader.search(PlaceQuery.parse("","서울특별시",0,0,0.001,"마포구"));
        assertFalse(mapo.get("results").isEmpty());
        for (var p : mapo.get("results")) {
            assertTrue(p.get("address").asText().contains("마포구"));
            assertTrue(p.get("distanceKm").isNull());
        }
        var cup = reader.search(PlaceQuery.parse("텀블러","서울특별시",0,0,0.001,"마포구"));
        assertFalse(cup.get("results").isEmpty());
        for (var p : cup.get("results")) {
            assertTrue(p.get("address").asText().contains("마포구"));
            assertTrue(p.get("category").asText().contains("개인컵"));
        }
        assertEquals(0,reader.search(PlaceQuery.parse("","부산광역시",0,0,0.001,"마포구")).get("results").size());
        assertEquals(0,reader.search(PlaceQuery.parse("","서울특별시",0,0,0.001,"마포구' OR 1=1 --")).get("results").size());
    }
    @Test void connectedCupActionNamesReturnTheSamePlacesInTheSameOrder() {
        var jdbc = new NamedParameterJdbcTemplate(source());
        var reader = new JdbcPlaceReader(jdbc,new JsonMapper());
        var expected = ids(reader.search(PlaceQuery.parse("성동구 개인컵","서울특별시",37.5665,126.978,30)));
        assertEquals(13,expected.size());
        for (String query : List.of("성동구 텀블러","성동구 다회용컵","성동구 다회용 컵")) {
            var actual = reader.search(PlaceQuery.parse(query,"서울특별시",37.5665,126.978,30));
            assertEquals(expected,ids(actual),query);
            for (var place : actual.get("results")) {
                assertTrue(place.get("summary").asText().contains("후보"));
                assertTrue(place.get("address").asText().contains("성동구"));
            }
        }
        assertTrue(ids(reader.search(PlaceQuery.parse("성동구 텀블러","광주광역시",37.5665,126.978,30))).isEmpty());
        assertTrue(ids(reader.search(PlaceQuery.parse("성동구 텀블러","서울특별시",37.5665,126.978,0.001))).isEmpty());
    }

    @Test void actionSearchDoesNotLeakOtherActionsCommonRequirementsOrBenefitText() {
        var jdbc = new NamedParameterJdbcTemplate(source());
        var reader = new JdbcPlaceReader(jdbc,new JsonMapper());
        var cups = ids(reader.search(PlaceQuery.parse("성동구 개인컵","서울특별시",37.5665,126.978,30)));
        var refill = reader.search(PlaceQuery.parse("성동구 리필","서울특별시",37.5665,126.978,30));
        assertFalse(ids(refill).isEmpty());
        assertTrue(ids(refill).stream().noneMatch(cups::contains));
        for (String query : List.of("성동구 텀블러 리필","성동구 개인컵 회원가입","성동구 개인컵 300원"))
            assertTrue(ids(reader.search(PlaceQuery.parse(query,"서울특별시",37.5665,126.978,30))).isEmpty(),query);
    }

    @Test void closedActionCannotMatchEvenWhenAnotherActionKeepsThePlaceVisible() {
        var source = source();
        var jdbc = new NamedParameterJdbcTemplate(source);
        var reader = new JdbcPlaceReader(jdbc,new JsonMapper());
        new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(transaction -> {
            transaction.setRollbackOnly();
            var placeId = ids(reader.search(PlaceQuery.parse("성동구 개인컵","서울특별시",37.5665,126.978,30))).getFirst();
            jdbc.getJdbcTemplate().update("UPDATE app.action_place SET status='closed' WHERE place_id=?",placeId);
            jdbc.getJdbcTemplate().update("""
                INSERT INTO app.action_place(program_key,action_id,place_id,service_key,source_id,schedule,status,relation_type)
                SELECT program_key,'KR-CNP-GREEN-2026-A04',place_id,'test-refill',source_id,schedule,'unknown','candidate_action'
                FROM app.action_place WHERE place_id=? LIMIT 1
                """,placeId);
            assertTrue(ids(reader.search(PlaceQuery.parse("성동구 개인컵","서울특별시",37.5665,126.978,30))).contains(placeId));
            assertFalse(ids(reader.search(PlaceQuery.parse("성동구 텀블러","서울특별시",37.5665,126.978,30))).contains(placeId));
            assertTrue(ids(reader.search(PlaceQuery.parse("성동구 리필","서울특별시",37.5665,126.978,30))).contains(placeId));
            jdbc.getJdbcTemplate().update("UPDATE app.action_place SET status='closed' WHERE place_id=?",placeId);
            assertFalse(ids(reader.search(PlaceQuery.parse("성동구 개인컵","서울특별시",37.5665,126.978,30))).contains(placeId));
        });
    }

    @Test void realImportedPlacesRespectCoordinatesTermsRadiusAndOrdering() {
        var source = new DriverManagerDataSource(System.getenv("PLACE_TEST_DATABASE_URL"),"eco","map-test");
        var jdbc = new NamedParameterJdbcTemplate(source);
        var reader = new JdbcPlaceReader(jdbc,new JsonMapper());
        assertTrue(jdbc.getJdbcTemplate().queryForObject("SELECT count(*) FROM app.place",Integer.class)>1000);
        var all = reader.search(PlaceQuery.parse("","서울특별시",37.5665,126.978,30));
        assertEquals(40,all.get("results").size());
        double previous=-1;
        for (var place : all.get("results")) {
            double distance=place.get("distanceKm").asDouble();
            assertTrue(distance>=previous && distance<=30);previous=distance;
            assertFalse(place.get("latitude").isNull());
            assertTrue(place.get("summary").asText().contains("후보"));
        }
        var cafe = reader.search(PlaceQuery.parse("성동구 개인컵","서울특별시",37.5665,126.978,30));
        assertFalse(cafe.get("results").isEmpty());
        for (var p:cafe.get("results")) {
            assertTrue(p.get("address").asText().contains("성동구"));
            assertTrue(p.get("category").asText().contains("개인컵"));
        }
        for (String query:new String[]{"%_'","없는장소아무것도","' OR 1=1 --"})
            assertEquals(0,reader.search(PlaceQuery.parse(query,"서울특별시",37.5665,126.978,30)).get("results").size());
        assertEquals(0,reader.search(PlaceQuery.parse("","광주광역시",37.5665,126.978,30)).get("results").size());
        var first=all.get("results").get(0);
        var near=reader.search(PlaceQuery.parse("","서울특별시",first.get("latitude").asDouble(),first.get("longitude").asDouble(),0.001));
        assertFalse(near.get("results").isEmpty());
        for(var p:near.get("results")) assertTrue(p.get("distanceKm").asDouble()<=0.001);
    }
}
